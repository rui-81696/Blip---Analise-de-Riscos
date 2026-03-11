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

// ─── 1. Criar app Express e servidor HTTP ───────────────────────────
// O Express é um framework para criar APIs HTTP.
// Criamos o servidor HTTP manualmente (createServer) para poder
// partilhar a mesma porta com o WebSocket.

const app = express();
const server = createServer(app);

// Rota básica para confirmar que o servidor está vivo
app.get("/", (req, res) => {
  res.json({
    status: "online",
    combinacoes: allEventSelections.length,
    oddsGeradas: oddsMap.size,
  });
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

  // 1) Enviar apostas iniciais em blocos de CHUNK_SIZE
  const initialBets = generateInitialBets();

  for (let i = 0; i < initialBets.length; i += CHUNK_SIZE) {
    const chunk = initialBets.slice(i, i + CHUNK_SIZE);
    ws.send(JSON.stringify({ type: "initial", bets: chunk }));
  }
  console.log("Apostas iniciais enviadas.\n");

  // 2) Streaming em tempo real
  const interval = setInterval(() => {
    if (ws.readyState !== ws.OPEN) {
      clearInterval(interval);
      return;
    }

    const batch = [];
    for (let i = 0; i < BETS_PER_BATCH; i++) {
      batch.push(generateBet());
    }
    ws.send(JSON.stringify({ type: "live", bets: batch }));
  }, INTERVAL_MS);

  ws.on("close", () => {
    console.log("Cliente WebSocket desconectado.");
    clearInterval(interval);
  });
});

// ─── 3. Iniciar o servidor ──────────────────────────────────────────
// server.listen() arranca AMBOS — Express e WebSocket — na mesma porta.

server.listen(PORT, () => {
  console.log(`\nServidor a correr na porta ${PORT}`);
  console.log(`  HTTP:      http://localhost:${PORT}/`);
  console.log(`  WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`\nCombinações evento+seleção: ${allEventSelections.length}`);
  console.log(`Odds pré-geradas: ${oddsMap.size} conjuntos de 4 valores\n`);
});
