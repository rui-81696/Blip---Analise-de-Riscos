/*
 * ===== index.js (Backend) =====
 * Este é o PONTO DE ENTRADA do servidor backend.
 * Usa o framework Express.js para criar uma API REST (servidor HTTP).
 *
 * O QUE É UMA API REST?
 * É um servidor que responde a pedidos HTTP (GET, POST, PUT, DELETE)
 * com dados em formato JSON. O frontend faz pedidos a esta API para
 * obter/enviar dados.
 *
 * O QUE É O EXPRESS?
 * Express é o framework mais popular de Node.js para criar servidores web.
 * Simplifica a criação de rotas (endpoints), middleware, etc.
 *
 * FLUXO DE ARRANQUE:
 * 1. Importa dependências
 * 2. Configura middleware (CORS, JSON parser)
 * 3. Inicializa a base de dados (LowDB - ficheiro JSON)
 * 4. Se a BD estiver vazia, gera dados falsos (mock)
 * 5. Regista as rotas (URLs que a API responde)
 * 6. Inicia o servidor numa porta (3001)
 * 7. Começa a gerar apostas novas a cada 30 segundos
 */

// Express: framework para criar o servidor HTTP/API
import express from 'express';

// CORS (Cross-Origin Resource Sharing): permite que o frontend (porta 5173)
// faça pedidos ao backend (porta 3001). Sem isto, o browser bloqueia os pedidos.
import cors from 'cors';

// Função para inicializar a base de dados LowDB (ficheiro JSON)
import { initDb } from './data/db.js';

// Função para gerar dados falsos iniciais
import { seedDatabase } from './data/seed.js';

// Routers: agrupam endpoints relacionados
import betsRouter from './routes/bets.js';     // Endpoints de /api/bets
import metricsRouter from './routes/metrics.js'; // Endpoints de /api/metrics

// Criar a aplicação Express (o servidor)
const app = express();

// Porta onde o servidor vai correr.
// process.env.PORT permite usar uma variável de ambiente (útil em produção).
// || 3001 é o valor por defeito (fallback) para desenvolvimento.
const PORT = process.env.PORT || 3001;

/*
 * ─── MIDDLEWARE ───
 * Middleware são funções que processam TODOS os pedidos antes de chegarem às rotas.
 * São como "filtros" que o pedido atravessa.
 *
 * app.use() regista middleware na aplicação.
 */
app.use(cors());          // Permitir pedidos de outros domínios (frontend)
app.use(express.json());  // Converter o corpo dos pedidos de JSON para objetos JS

/*
 * ─── INICIALIZAR BASE DE DADOS ───
 * LowDB é uma base de dados simples que guarda tudo num ficheiro JSON.
 * Ideal para protótipos e projetos pequenos.
 * await = esperar que a operação assíncrona (abrir/ler ficheiro) termine.
 */
const db = await initDb();

/*
 * ─── SEED (Gerar dados iniciais) ───
 * Se a base de dados estiver vazia (primeira execução),
 * gera 500 apostas falsas simuladas para termos dados para visualizar.
 */
const bets = db.data.bets;
if (!bets || bets.length === 0) {
  console.log('📦 Base de dados vazia. A gerar dados mock...');
  await seedDatabase(db);
  console.log(`✅ ${db.data.bets.length} apostas geradas com sucesso.`);
}

/*
 * ─── REGISTAR ROTAS ───
 * app.use(caminho, router) associa um router a um caminho base.
 * Todos os endpoints dentro do router ficam "debaixo" desse caminho.
 * Ex: betsRouter tem GET '/' que se torna GET '/api/bets'
 */
app.use('/api/bets', betsRouter(db));       // Endpoints de apostas
app.use('/api/metrics', metricsRouter(db));  // Endpoints de métricas

// Health check: endpoint simples para verificar se o servidor está vivo
// Útil para monitorização e para o Playwright (testes E2E)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/*
 * ─── GERAÇÃO PERIÓDICA DE APOSTAS (simula dados em tempo real) ───
 * A cada 30 segundos, gera uma nova aposta falsa e adiciona à base de dados.
 * Isto simula um sistema real onde apostas estão constantemente a ser criadas.
 */
const GENERATION_INTERVAL = 30000; // 30 segundos em milissegundos
let generationTimer = null;

async function startPeriodicGeneration() {
  // Import dinâmico: carrega o módulo só quando é necessário
  const { generateSingleBet } = await import('./data/mockGenerator.js');
  
  // setInterval: executa a função repetidamente a cada X milissegundos
  generationTimer = setInterval(async () => {
    // Gerar uma nova aposta falsa
    const newBet = generateSingleBet();

    // Adicionar ao array de apostas na base de dados
    db.data.bets.push(newBet);
    
    // Limite de segurança: manter no máximo 10000 registos
    // .slice(-10000) mantém apenas os últimos 10000 elementos
    if (db.data.bets.length > 10000) {
      db.data.bets = db.data.bets.slice(-10000);
    }
    
    // Guardar alterações no ficheiro JSON
    await db.write();
    console.log(`🎰 Nova aposta gerada: ${newBet.id.slice(0, 8)}... (${newBet.sport} - €${newBet.amount})`);
  }, GENERATION_INTERVAL);
}

/*
 * ─── INICIAR O SERVIDOR ───
 * app.listen(porta, callback) inicia o servidor na porta especificada.
 * A callback é executada quando o servidor está pronto.
 */
app.listen(PORT, async () => {
  console.log(`\n🚀 Blip Risk Analysis - Backend`);
  console.log(`📡 Servidor a correr em http://localhost:${PORT}`);
  console.log(`📊 API disponível em http://localhost:${PORT}/api`);
  console.log(`💾 Total de apostas: ${db.data.bets.length}\n`);
  
  // Começar a gerar apostas automaticamente
  await startPeriodicGeneration();
});

// Exportar a app para que possa ser usada em testes
export default app;
