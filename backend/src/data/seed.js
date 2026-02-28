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
 * 2. Manualmente: node src/data/seed.js 1000 (gera 1000 apostas)
 */

// Importar a função que gera apostas falsas
import { generateBets } from './mockGenerator.js';

/**
 * Popula a base de dados com dados mock (falsos) iniciais.
 *
 * @param {object} db - Instância da base de dados LowDB
 * @param {number} count - Número de apostas a gerar (por defeito: 500)
 * @returns {Array} Array com as apostas geradas
 */
export async function seedDatabase(db, count = 500) {
  // Gerar 'count' apostas falsas dos últimos 30 dias
  const bets = generateBets(count, { daysBack: 30 });

  // Substituir os dados na base de dados
  db.data.bets = bets;
  db.data.metadata = {
    lastUpdated: new Date().toISOString(),
    totalGenerated: count,
  };

  // Guardar no ficheiro JSON
  await db.write();
  return bets;
}

/*
 * ─── EXECUÇÃO DIRETA ───
 * Este bloco só é executado quando corremos o ficheiro diretamente:
 *   node src/data/seed.js
 *   node src/data/seed.js 1000   (para gerar 1000 apostas)
 *
 * process.argv é um array com os argumentos da linha de comandos:
 *   [0] = caminho do node
 *   [1] = caminho do script
 *   [2] = primeiro argumento (número de apostas)
 */
if (process.argv[1] && process.argv[1].includes('seed')) {
  const { initDb } = await import('./db.js');
  const db = await initDb();
  const count = parseInt(process.argv[2]) || 500; // Argumento ou 500 por defeito

  console.log(`🌱 A gerar ${count} apostas mock...`);
  await seedDatabase(db, count);
  console.log(`✅ ${count} apostas geradas e guardadas em db.json`);
}
