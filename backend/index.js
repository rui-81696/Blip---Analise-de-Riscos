// ─── SERVIDOR HTTP (Express) + WEBSOCKET ────────────────────────────
//
// O Express e o WebSocket partilham a mesma porta (3001).
// O WebSocket fica acessível em ws://localhost:3001/ws
//
// WebSocket permite comunicação bidirecional em tempo real.
// Quando uma nova aposta é gerada, é imediatamente enviada a todos
// os clientes ligados (broadcast), sem que o frontend precise de fazer polling.

import express from "express";
import { createServer } from "http";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { PORT, CHUNK_SIZE, BETS_PER_BATCH, INTERVAL_MS, INITIAL_COUNT } from "./config.js";
import { allEventSelections, oddsMap } from "./generators/odds.js";
import { generateBet, generateInitialBets } from "./generators/bets.js";
import {
  getBetsCount,
  getMaxId,
  enqueueBets,
  flushAndClosePostgres,
  getInitialSyncBets,
  initPostgres,
  isPostgresEnabled,
  startPostgresPersistenceWorker,
} from "./db/postgres.js";
import betsRouter from "./routes/bets.js";
import rootRouter from "./routes/root.js";
import statsRouter from "./routes/stats.js";
import assistantRouter from "./routes/assistant.js";

// ─── 1. Criar app Express e servidor HTTP ───────────────────────────
// O Express é um framework para criar APIs HTTP.
// Criamos o servidor HTTP manualmente (createServer) para poder
// partilhar a mesma porta com o WebSocket.

const app = express();
const server = createServer(app);

// ─── Middleware ──────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEMO_CUTOFF_FILE = path.join(__dirname, "db", "demo-cutoff.json");

let initialBets = [];
let globalNextId = 0;

async function sendInitialBetsInChunks(ws, bets) {
  for (let i = 0; i < bets.length; i += CHUNK_SIZE) {
    if (ws.readyState !== ws.OPEN) {
      return false;
    }

    const chunk = bets.slice(i, i + CHUNK_SIZE);

    await new Promise((resolve, reject) => {
      ws.send(JSON.stringify({ type: "initial", bets: chunk }), (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    if (ws.bufferedAmount > 8 * 1024 * 1024) {
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
    }
  }

  return true;
}

// ─── Routers modulares ──────────────────────────────────────────────
app.use("/", rootRouter);
app.use("/api/bets", betsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/assistant", assistantRouter);

// ─── 2. Criar WebSocket Server ──────────────────────────────────────
// O WebSocket "agarra-se" ao servidor HTTP existente.
// { server } → usa o mesmo servidor HTTP do Express
// { path: "/ws" } → o WebSocket só aceita ligações em /ws
//
// Isto significa que:
//   - http://localhost:3001/    → Express (REST)
//   - ws://localhost:3001/ws    → WebSocket (tempo real)

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  console.log("Cliente WebSocket conectado!");
  ws.isInitialSyncDone = false;

  sendInitialBetsInChunks(ws, initialBets)
    .then((completed) => {
      if (!completed) {
        return;
      }

      ws.isInitialSyncDone = true;
      console.log("Apostas iniciais enviadas.\n");
    })
    .catch((error) => {
      console.error("Erro ao enviar sync inicial via WebSocket:", error.message);
    });

  ws.on("close", () => {
    console.log("Cliente WebSocket desconectado.");
  });
});

function startLiveStreaming() {
  setInterval(() => {
    const batch = [];

    for (let i = 0; i < BETS_PER_BATCH; i++) {
      globalNextId++;
      batch.push(generateBet({ nextId: globalNextId, isLive: true }));
    }

    const payload = JSON.stringify({ type: "live", bets: batch });

    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN && client.isInitialSyncDone) {
        client.send(payload);
      }
    });

    if (isPostgresEnabled()) {
      enqueueBets(batch);
    }
  }, INTERVAL_MS);
}

async function persistDemoCutoff(cutoffDate, metadata = {}) {
  const payload = {
    cutoffIso: cutoffDate.toISOString(),
    recordedAtIso: new Date().toISOString(),
    ...metadata,
  };

  await mkdir(path.dirname(DEMO_CUTOFF_FILE), { recursive: true });
  await writeFile(DEMO_CUTOFF_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`\nRecebido ${signal}. A fechar servidor...`);

  try {
    if (isPostgresEnabled()) {
      await flushAndClosePostgres();
      console.log("Fila PostgreSQL drenada com sucesso.");
    }
  } catch (error) {
    console.error("Erro no fecho do PostgreSQL:", error.message);
  } finally {
    server.close(() => {
      process.exit(0);
    });
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ─── 3. Iniciar o servidor ──────────────────────────────────────────
// server.listen() arranca AMBOS — Express e WebSocket — na mesma porta.

try {
  await initPostgres();

  if (isPostgresEnabled()) {
    startPostgresPersistenceWorker();

    // 3. Sincronizar o contador com o banco de dados
    const lastId = await getMaxId(); 
    globalNextId = lastId;

    const currentCount = await getBetsCount();

    if (currentCount === 0) {
      console.log("Seed inicial ativada: tabela bets vazia.");
      initialBets = await generateInitialBets();

      // Atualizar o globalNextId após o seed para que o Live comece depois dele
      globalNextId = initialBets.length > 0 ? initialBets[initialBets.length - 1].id : 0;

      enqueueBets(initialBets);
      console.log(`Apostas iniciais enfileiradas para persistência (${initialBets.length.toLocaleString()}).`);
    } else {
      console.log(`Seed inicial ignorada: já existem ${currentCount.toLocaleString()} registos em bets.`);
      initialBets = await getInitialSyncBets({ limit: currentCount });
      console.log(`Apostas carregadas da base de dados para initial sync WS (${initialBets.length.toLocaleString()}).`);
    }

    const liveCutoff = new Date();
    await persistDemoCutoff(liveCutoff, {
      reason: "startup-live-cutoff",
      existingCountBeforeSeedDecision: currentCount,
      seedExecuted: currentCount === 0,
    });
    console.log(`Cutoff da demo registado para cleanup de live: ${liveCutoff.toISOString()}`);
  } else {
    initialBets = [];
    console.warn("PostgreSQL desativado: seed de 400k não será executada e o initial sync WS inicia vazio.");
  }

  startLiveStreaming();
  console.log(`Streaming live ativo (~${Math.round((BETS_PER_BATCH * 1000) / INTERVAL_MS)} apostas/segundo).`);

  server.listen(PORT, () => {
    console.log(`\nServidor a correr na porta ${PORT}`);
    console.log(`  HTTP:      http://localhost:${PORT}/`);
    console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
    console.log(`\nCombinações evento+seleção: ${allEventSelections.length}`);
    console.log(`Odds pré-geradas: ${oddsMap.size} conjuntos de 4 valores\n`);
  });
} catch (error) {
  console.error("Falha no arranque do servidor:", error.message);
  process.exit(1);
}
