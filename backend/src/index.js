/*
 * ===== index.js (Backend) =====
 * PONTO DE ENTRADA do servidor backend.
 * Usa Express.js para a API REST e WebSocket (ws) para streaming em tempo real.
 *
 * ARQUITETURA:
 * 1. API REST (Express): endpoints para consultar dados históricos, métricas
 * 2. WebSocket: streaming de novas apostas em tempo real para o frontend
 *
 * FLUXO DE ARRANQUE:
 * 1. Configura Express + middleware
 * 2. Inicializa a base de dados (LowDB)
 * 3. Se BD vazia ou modelo antigo, gera dados mock (seed)
 * 4. Regista rotas REST
 * 5. Cria servidor HTTP + WebSocket na mesma porta
 * 6. Inicia geração periódica de apostas (broadcast via WebSocket)
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { initDb } from './data/db.js';
import { seedDatabase } from './data/seed.js';
import { generateMarkets, generateSingleBet } from './data/mockGenerator.js';

import betsRouter from './routes/bets.js';
import metricsRouter from './routes/metrics.js';

const app = express();
const PORT = process.env.PORT || 3001;

/*
 * ─── MIDDLEWARE ───
 */
app.use(cors());
app.use(express.json());

/*
 * ─── BASE DE DADOS ───
 */
const db = await initDb();

/*
 * ─── SEED + MERCADOS ───
 * Se a BD estiver vazia OU tiver o modelo antigo (versão < 2), re-gera tudo.
 * Os mercados são guardados para reutilizar na geração via WebSocket.
 */
let markets = db.data.markets || null;

if (!db.data.version || db.data.version < 2 || !db.data.bets || db.data.bets.length === 0) {
  console.log('📦 Base de dados vazia ou modelo antigo. A gerar dados mock...');
  const result = await seedDatabase(db);
  markets = result.markets;
  console.log(`✅ ${db.data.bets.length} apostas geradas com sucesso.`);
} else if (!markets || Object.keys(markets).length === 0) {
  // BD tem dados mas não tem mercados → regenerar mercados
  markets = generateMarkets();
  db.data.markets = markets;
  await db.write();
  console.log('🔄 Mercados regenerados.');
}

/*
 * ─── ROTAS REST ───
 */
app.use('/api/bets', betsRouter(db));
app.use('/api/metrics', metricsRouter(db));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    totalBets: db.data.bets.length,
    wsClients: wss.clients.size,
  });
});

/*
 * ─── SERVIDOR HTTP + WEBSOCKET ───
 * O servidor HTTP (Express) e o WebSocket partilham a mesma porta.
 * O WebSocket fica acessível em ws://localhost:3001/ws
 *
 * WebSocket permite comunicação bidirecional em tempo real.
 * Quando uma nova aposta é gerada, é imediatamente enviada a todos
 * os clientes ligados (broadcast), sem que o frontend precise de fazer polling.
 */
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log(`🔗 WebSocket client conectado (total: ${wss.clients.size})`);
  ws.on('close', () => {
    console.log(`🔌 WebSocket client desconectado (total: ${wss.clients.size})`);
  });
});

/**
 * Envia dados a TODOS os clientes WebSocket ligados (broadcast).
 * @param {object} data - Dados a enviar (serão convertidos para JSON)
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // 1 = WebSocket.OPEN
      client.send(message);
    }
  });
}

/*
 * ─── GERAÇÃO PERIÓDICA DE APOSTAS (tempo real via WebSocket) ───
 *
 * A cada 2 segundos, gera um lote de apostas novas e transmite via WebSocket.
 * Simula o fluxo contínuo de apostas que uma empresa de apostas recebe.
 *
 * Nota: Em produção seriam ~500/seg (normal) ou ~2000/seg (pico).
 * Para demo, geramos ~5 apostas/lote a cada 2 segundos.
 *
 * As apostas são também guardadas na BD (com save periódico a cada 30s
 * para não sobrecarregar o disco com escritas constantes).
 */
const GENERATION_INTERVAL = 2000;   // Intervalo entre lotes (ms)
const BETS_PER_BATCH = 5;           // Apostas por lote
const DB_SAVE_INTERVAL = 30000;     // Intervalo de save ao disco (ms)
const MAX_BETS = 200000;            // Limite de apostas na BD
let pendingSave = false;

async function startPeriodicGeneration() {
  // Gerar e transmitir novas apostas periodicamente
  setInterval(() => {
    const newBets = [];
    for (let i = 0; i < BETS_PER_BATCH; i++) {
      const bet = generateSingleBet(markets);
      bet.createdAt = new Date().toISOString(); // Data atual (tempo real)
      newBets.push(bet);
      db.data.bets.push(bet);
    }

    // Limitar o tamanho da BD (manter apenas os mais recentes)
    if (db.data.bets.length > MAX_BETS) {
      db.data.bets = db.data.bets.slice(-MAX_BETS);
    }

    pendingSave = true;

    // Broadcast a todos os clientes WebSocket
    broadcast({ type: 'new_bets', data: newBets });
  }, GENERATION_INTERVAL);

  // Save periódico ao disco (evita writes constantes)
  setInterval(async () => {
    if (pendingSave) {
      db.data.metadata.lastUpdated = new Date().toISOString();
      await db.write();
      pendingSave = false;
    }
  }, DB_SAVE_INTERVAL);
}

/*
 * ─── INICIAR O SERVIDOR ───
 * server.listen (não app.listen) porque o HTTP e WS partilham o servidor.
 */
server.listen(PORT, async () => {
  console.log(`\n🚀 Blip Risk Analysis - Backend`);
  console.log(`📡 HTTP em http://localhost:${PORT}`);
  console.log(`🔌 WebSocket em ws://localhost:${PORT}/ws`);
  console.log(`💾 Total de apostas: ${db.data.bets.length}`);
  console.log(`📊 Mercados: ${Object.keys(markets).length} eventos\n`);

  await startPeriodicGeneration();
});

export default app;
