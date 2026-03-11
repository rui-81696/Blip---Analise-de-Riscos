/*
 * ===== seed.js =====
 * Script de SEED (semeadura) da base de dados.
 *
 * O que é "seed"?
 * Seed significa preencher a base de dados com dados iniciais.
 * Quando a aplicação arranca pela primeira vez, a BD está vazia.
 * Este script gera dados falsos (mock) para termos dados para visualizar.
 *
 * Pode ser executado de duas formas:
 * 1. Automaticamente: o index.js chama seedDatabase() se a BD estiver vazia
 * 2. Manualmente: node src/data/seed.js 50000 (gera 50000 apostas)
 *
 * VOLUME:
 * Em produção, esperamos ~10000 apostas por evento.
 * Com ~26 eventos, o seed gera ~50000 apostas por defeito.
 */

import { generateBets } from './mockGenerator.js';

/**
 * Popula a base de dados com dados mock (falsos) iniciais.
 * Gera apostas E mercados (mercados são reutilizados pelo WebSocket).
 *
 * @param {object} db - Instância da base de dados LowDB
 * @param {number} count - Número de apostas a gerar (por defeito: 50000)
 * @returns {{ bets: Array, markets: object }} Apostas e mercados gerados
 */
export async function seedDatabase(db, count = 50000) {
  console.log(`🌱 A gerar mercados e ${count} apostas...`);

  // generateBets agora retorna { bets, markets }
  const { bets, markets } = generateBets(count, { daysBack: 30 });

  // Substituir os dados na base de dados
  db.data.bets = bets;
  db.data.markets = markets;
  db.data.metadata = {
    lastUpdated: new Date().toISOString(),
    totalGenerated: count,
  };

  // Guardar no ficheiro JSON
  await db.write();
  return { bets, markets };
}

/*
 * ─── EXECUÇÃO DIRETA ───
 * Executar com: node src/data/seed.js [número]
 * Ex: node src/data/seed.js 50000
 */
if (process.argv[1] && process.argv[1].includes('seed')) {
  const { initDb } = await import('./db.js');
  const db = await initDb();
  const count = parseInt(process.argv[2]) || 50000;

  console.log(`🌱 A gerar ${count} apostas mock...`);
  const { bets } = await seedDatabase(db, count);
  console.log(`✅ ${bets.length} apostas geradas e guardadas em db.json`);
}
