/*
 * ===== db.js =====
 * Configuração da BASE DE DADOS.
 *
 * Usa LowDB - uma base de dados "flat file" extremamente simples
 * que guarda tudo num ficheiro JSON no disco.
 *
 * Vantagens do LowDB para este projeto:
 * - Não precisa de instalar MySQL, PostgreSQL, etc.
 * - Os dados são legíveis (é um ficheiro JSON normal)
 * - Simples de usar: db.data.bets para aceder, db.write() para guardar
 *
 * Em produção usaríamos uma BD "a sério" como PostgreSQL ou MongoDB.
 */

// Módulos do Node.js para trabalhar com caminhos de ficheiros
import { join, dirname } from 'path'; // join junta partes de um caminho; dirname extrai o diretório
import { fileURLToPath } from 'url';   // Converte file:// URL para caminho do sistema
import { mkdirSync } from 'fs';        // Cria diretórios no sistema de ficheiros

// LowDB: a biblioteca de base de dados que guarda dados em JSON
import { JSONFilePreset } from 'lowdb/node';

/*
 * ─── CALCULAR CAMINHOS ───
 * Em módulos ES ("type": "module"), __dirname não existe por defeito.
 * Temos de o calcular manualmente a partir de import.meta.url.
 *
 * import.meta.url = URL do ficheiro atual (ex: file:///c:/Users/.../db.js)
 * fileURLToPath() = converte para caminho do SO (ex: c:\Users\...\db.js)
 * dirname() = extrai apenas o diretório (ex: c:\Users\...\data)
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

// Caminho para a pasta 'data' (2 níveis acima: data/ → src/ → backend/data/)
const DATA_DIR = join(__dirname, '..', '..', 'data');

// Caminho completo para o ficheiro da base de dados
const DB_PATH = join(DATA_DIR, 'db.json');

// Garantir que o diretório de dados existe (cria se não existir)
// { recursive: true } cria diretórios intermédios se necessário
mkdirSync(DATA_DIR, { recursive: true });

// Estrutura inicial da base de dados (usada quando o ficheiro não existe)
const defaultData = {
  version: 2,          // Versão do modelo de dados (2 = novo modelo Bet)
  bets: [],            // Array vazio para guardar as apostas
  markets: {},         // Mercados pré-gerados (seleções + odds por evento)
  metadata: {
    lastUpdated: null,   // Data da última atualização
    totalGenerated: 0,   // Contador de apostas geradas
  },
};

/**
 * Inicializa e devolve a instância da base de dados LowDB.
 * 
 * Como usar:
 *   const db = await initDb();
 *   console.log(db.data.bets);  // Aceder às apostas
 *   db.data.bets.push(novaAposta); // Adicionar
 *   await db.write();           // Guardar no ficheiro
 *
 * @returns {Promise<object>} Instância da base de dados
 */
export async function initDb() {
  // JSONFilePreset cria/abre o ficheiro JSON e carrega os dados
  const db = await JSONFilePreset(DB_PATH, defaultData);

  // Ler os dados do ficheiro para memória
  await db.read();

  return db;
}
