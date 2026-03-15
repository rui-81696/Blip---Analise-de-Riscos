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
import { WebSocketServer } from "ws";
import { PORT, CHUNK_SIZE, BETS_PER_BATCH, INTERVAL_MS } from "./config.js";
import { allEventSelections, oddsMap } from "./generators/odds.js";
import { generateBet, generateInitialBets } from "./generators/bets.js";
import {
  enqueueBets,
  flushAndClosePostgres,
  getBetById,
  getLatestBets,
  initPostgres,
  isPostgresEnabled,
  startPostgresPersistenceWorker,
} from "./db/postgres.js";

// ─── 1. Criar app Express e servidor HTTP ───────────────────────────
// O Express é um framework para criar APIs HTTP.
// Criamos o servidor HTTP manualmente (createServer) para poder
// partilhar a mesma porta com o WebSocket.

const app = express();
const server = createServer(app);

let initialBets = [];

// Rota básica para confirmar que o servidor está vivo
app.get("/", (req, res) => {
  res.json({
    status: "online",
    combinacoes: allEventSelections.length,
    oddsGeradas: oddsMap.size,
  });
});

app.get("/api/bets", async (req, res) => {
  if (!isPostgresEnabled()) {
    return res.status(503).json({
      error: "PostgreSQL está desativado. Ativa POSTGRES_ENABLED=true para usar este endpoint.",
    });
  }

  try {
    const data = await getLatestBets({
      limit: req.query.limit,
      offset: req.query.offset,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter apostas da base de dados.",
      detail: error.message,
    });
  }
});

app.get("/api/bets/:id", async (req, res) => {
  if (!isPostgresEnabled()) {
    return res.status(503).json({
      error: "PostgreSQL está desativado. Ativa POSTGRES_ENABLED=true para usar este endpoint.",
    });
  }

  try {
    const bet = await getBetById(req.params.id);

    if (!bet) {
      return res.status(404).json({ error: "Aposta não encontrada." });
    }

    return res.json({ bet });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter aposta da base de dados.",
      detail: error.message,
    });
  }
});

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

  // 1) Enviar apostas iniciais em blocos de CHUNK_SIZE
  for (let i = 0; i < initialBets.length; i += CHUNK_SIZE) {
    const chunk = initialBets.slice(i, i + CHUNK_SIZE);
    ws.send(JSON.stringify({ type: "initial", bets: chunk }));
  }
  ws.isInitialSyncDone = true;
  console.log("Apostas iniciais enviadas.\n");

  ws.on("close", () => {
    console.log("Cliente WebSocket desconectado.");
  });
});

function startLiveStreaming() {
  setInterval(() => {
    const batch = [];

    for (let i = 0; i < BETS_PER_BATCH; i++) {
      batch.push(generateBet({ isLive: true }));
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

  initialBets = generateInitialBets();

  if (isPostgresEnabled()) {
    startPostgresPersistenceWorker();
    enqueueBets(initialBets);
    console.log(`Apostas iniciais enfileiradas para persistência (${initialBets.length.toLocaleString()}).`);
  }

  startLiveStreaming();

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
