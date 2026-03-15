import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

const {
  POSTGRES_ENABLED = "false",
  POSTGRES_HOST = "localhost",
  POSTGRES_PORT = "5432",
  POSTGRES_DB = "blip",
  POSTGRES_USER = "postgres",
  POSTGRES_PASSWORD = "postgres",
  POSTGRES_SSL = "false",
  POSTGRES_RESET_ON_START = "true",
  POSTGRES_INSERT_CHUNK_SIZE = "2000",
  POSTGRES_FLUSH_INTERVAL_MS = "100",
} = process.env;

const postgresEnabled = POSTGRES_ENABLED.toLowerCase() === "true";
const postgresResetOnStart = POSTGRES_RESET_ON_START.toLowerCase() === "true";
const insertChunkSize = Number(POSTGRES_INSERT_CHUNK_SIZE);
const flushIntervalMs = Number(POSTGRES_FLUSH_INTERVAL_MS);

let pool = null;
let writeQueue = [];
let flushTimer = null;
let isFlushing = false;

function getSslConfig() {
  if (POSTGRES_SSL.toLowerCase() !== "true") {
    return false;
  }

  return { rejectUnauthorized: false };
}

function toRowValues(bet) {
  return [
    bet.id,
    bet.sport,
    bet.event,
    bet.betType,
    bet.selection,
    bet.odd,
    bet.stake,
    bet.timestamp,
    bet.potentialPayout,
    bet.potentialProfit,
    bet.riskScore,
    bet.exposureRisk,
  ];
}

function buildInsertQuery(bets) {
  const values = [];
  const placeholders = [];

  bets.forEach((bet, rowIndex) => {
    const baseIndex = rowIndex * 12;
    placeholders.push(`($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12})`);
    values.push(...toRowValues(bet));
  });

  return {
    text: `
      INSERT INTO bets (
        id,
        sport,
        event,
        bet_type,
        selection,
        odd,
        stake,
        timestamp,
        potential_payout,
        potential_profit,
        risk_score,
        exposure_risk
      ) VALUES ${placeholders.join(", ")}
      ON CONFLICT (id) DO NOTHING;
    `,
    values,
  };
}

export function isPostgresEnabled() {
  return postgresEnabled;
}

export async function initPostgres() {
  if (!postgresEnabled) {
    console.log("PostgreSQL desativado (POSTGRES_ENABLED=false).");
    return false;
  }

  pool = new Pool({
    host: POSTGRES_HOST,
    port: Number(POSTGRES_PORT),
    database: POSTGRES_DB,
    user: POSTGRES_USER,
    password: POSTGRES_PASSWORD,
    ssl: getSslConfig(),
  });

  await pool.query("SELECT 1");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bets (
      id UUID PRIMARY KEY,
      sport TEXT NOT NULL,
      event TEXT NOT NULL,
      bet_type TEXT NOT NULL,
      selection TEXT NOT NULL,
      odd NUMERIC(10, 2) NOT NULL,
      stake NUMERIC(10, 2) NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL,
      potential_payout NUMERIC(12, 2) NOT NULL,
      potential_profit NUMERIC(12, 2) NOT NULL,
      risk_score INTEGER NOT NULL,
      exposure_risk INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_bets_timestamp ON bets (timestamp DESC);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_bets_created_at ON bets (created_at DESC);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_bets_sport_timestamp ON bets (sport, timestamp DESC);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_bets_risk_timestamp ON bets (risk_score DESC, timestamp DESC);");

  if (postgresResetOnStart) {
    await pool.query("TRUNCATE TABLE bets;");
    console.log("Tabela bets limpa no arranque (POSTGRES_RESET_ON_START=true).");
  }

  console.log("PostgreSQL ligado com sucesso.");
  return true;
}

export async function insertBets(bets) {
  if (!pool || !Array.isArray(bets) || bets.length === 0) {
    return;
  }

  for (let i = 0; i < bets.length; i += insertChunkSize) {
    const chunk = bets.slice(i, i + insertChunkSize);
    const query = buildInsertQuery(chunk);
    await pool.query(query);
  }
}

export function enqueueBets(bets) {
  if (!pool || !Array.isArray(bets) || bets.length === 0) {
    return;
  }

  for (let i = 0; i < bets.length; i++) {
    writeQueue.push(bets[i]);
  }
}

async function flushBetQueue() {
  if (!pool || isFlushing || writeQueue.length === 0) {
    return;
  }

  isFlushing = true;

  try {
    const batch = writeQueue.splice(0, insertChunkSize);
    await insertBets(batch);
  } catch (error) {
    console.error("Erro ao persistir fila de apostas no PostgreSQL:", error.message);
  } finally {
    isFlushing = false;
  }
}

export function startPostgresPersistenceWorker() {
  if (!pool || flushTimer) {
    return;
  }

  flushTimer = setInterval(() => {
    flushBetQueue().catch((error) => {
      console.error("Erro inesperado no worker PostgreSQL:", error.message);
    });
  }, flushIntervalMs);

  console.log(`Worker PostgreSQL ativo (flush a cada ${flushIntervalMs}ms, chunk=${insertChunkSize}).`);
}

export async function flushAndClosePostgres() {
  if (!pool) {
    return;
  }

  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }

  while (writeQueue.length > 0 || isFlushing) {
    await flushBetQueue();
  }

  await pool.end();
  pool = null;
}

export async function getLatestBets({ limit = 200, offset = 0 } = {}) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const [{ rows: countRows }, { rows }] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS total FROM bets"),
    pool.query(
      `
        SELECT
          id,
          sport,
          event,
          bet_type,
          selection,
          odd,
          stake,
          risk_score,
          exposure_risk,
          timestamp,
          created_at
        FROM bets
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
      `,
      [safeLimit, safeOffset]
    ),
  ]);

  return {
    total: countRows[0]?.total ?? 0,
    bets: rows,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function getBetById(id) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const result = await pool.query(
    `
      SELECT
        id,
        sport,
        event,
        bet_type,
        selection,
        odd,
        stake,
        risk_score,
        exposure_risk,
        timestamp,
        created_at
      FROM bets
      WHERE id = $1
      LIMIT 1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}
