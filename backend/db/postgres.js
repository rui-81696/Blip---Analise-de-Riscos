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
  POSTGRES_RESET_ON_START = "false",
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
      ) VALUES ${placeholders.join(", ")};
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
      id BIGINT PRIMARY KEY,
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
  } else {
    console.log("Tabela bets preservada no arranque (POSTGRES_RESET_ON_START=false).");
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

export async function getBetsInRange({
  period = "24h",
  from,
  to,
  sport,
  betType,
  event,
  selection,
  search,
  limit = 200000,
  offset = 0,
} = {}) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const params = [];
  const whereClauses = [];

  if (from && to) {
    params.push(from, to);
    whereClauses.push(`timestamp >= $${params.length - 1}::timestamptz AND timestamp < $${params.length}::timestamptz`);
  } else {
    switch (String(period || "24h")) {
      case "today":
        whereClauses.push("timestamp >= date_trunc('day', now())");
        break;
      case "yesterday":
        whereClauses.push("timestamp >= date_trunc('day', now()) - interval '1 day'");
        whereClauses.push("timestamp < date_trunc('day', now())");
        break;
      case "1h":
        whereClauses.push("timestamp >= now() - interval '1 hour'");
        break;
      case "24h":
        whereClauses.push("timestamp >= now() - interval '24 hours'");
        break;
      case "7d":
      case "lastWeek":
        whereClauses.push("timestamp >= now() - interval '7 days'");
        break;
      default:
        whereClauses.push("timestamp >= now() - interval '24 hours'");
        break;
    }
  }

  if (sport && sport !== "all") {
    params.push(sport);
    whereClauses.push(`sport = $${params.length}`);
  }

  if (betType && betType !== "all") {
    params.push(betType);
    whereClauses.push(`bet_type = $${params.length}`);
  }

  if (event && event !== "all") {
    params.push(event);
    whereClauses.push(`event = $${params.length}`);
  }

  if (selection && selection !== "all") {
    params.push(selection);
    whereClauses.push(`selection = $${params.length}`);
  }

  const safeSearch = String(search || "").trim();
  if (safeSearch) {
    params.push(`%${safeSearch}%`);
    whereClauses.push(`(
      sport ILIKE $${params.length}
      OR event ILIKE $${params.length}
      OR bet_type ILIKE $${params.length}
      OR selection ILIKE $${params.length}
      OR id::text ILIKE $${params.length}
    )`);
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 200000, 1), 1000000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const queryParams = [...params, safeLimit, safeOffset];
  const { rows } = await pool.query(
    `
      SELECT
        id,
        sport,
        event,
        bet_type AS "betType",
        selection,
        odd::float8 AS odd,
        stake::float8 AS stake,
        timestamp,
        potential_payout::float8 AS "potentialPayout",
        potential_profit::float8 AS "potentialProfit",
        risk_score AS "riskScore",
        exposure_risk AS "exposureRisk"
      FROM bets
      ${whereSql}
      ORDER BY timestamp DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}
    `,
    queryParams
  );

  return rows;
}

export async function getBetsCount() {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM bets");
  return rows[0]?.total ?? 0;
}

export async function getInitialSyncBets({ limit = 400000 } = {}) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const safeLimit = Math.max(Number(limit) || 400000, 1);

  const { rows } = await pool.query(`
    SELECT
      id,
      sport,
      event,
      bet_type AS "betType",
      selection,
      odd::float8 AS odd,
      stake::float8 AS stake,
      risk_score AS "riskScore",
      exposure_risk AS "exposureRisk",
      timestamp,
      potential_payout AS "potentialPayout",
      potential_profit AS "potentialProfit"
    FROM bets
    ORDER BY timestamp DESC
    LIMIT $1
  `, [safeLimit]);

  return rows;
}

function getCleanupField(field) {
  if (field === "created_at") {
    return "created_at";
  }

  return "timestamp";
}

export async function countBetsAfterCutoff({ cutoffIso, field = "timestamp" }) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  if (!cutoffIso) {
    throw new Error("cutoffIso é obrigatório.");
  }

  const cleanupField = getCleanupField(field);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total FROM bets WHERE ${cleanupField} > $1::timestamptz`,
    [cutoffIso]
  );

  return rows[0]?.total ?? 0;
}

export async function deleteBetsAfterCutoff({ cutoffIso, field = "timestamp" }) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  if (!cutoffIso) {
    throw new Error("cutoffIso é obrigatório.");
  }

  const cleanupField = getCleanupField(field);
  const { rowCount } = await pool.query(
    `DELETE FROM bets WHERE ${cleanupField} > $1::timestamptz`,
    [cutoffIso]
  );

  return rowCount ?? 0;
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

export async function getGroupedBets({
  search = "",
  sport = "all",
  minStake = 0,
  timeRange = 120,
  sortField = "totalExposure",
  sortOrder = "desc",
  limit = 500,
  offset = 0,
} = {}) {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const params = [];
  const whereClauses = [];

  const safeTimeRange = Number(timeRange);

  if (safeTimeRange === -1) {
    whereClauses.push("timestamp >= date_trunc('day', now())");
  } else {
    const minutes = Math.min(Math.max(Number(timeRange) || 120, 1), 24 * 60);
    params.push(minutes);
    whereClauses.push(`timestamp >= now() - ($${params.length} * interval '1 minute')`);
  }

  if (sport && sport !== "all") {
    params.push(sport);
    whereClauses.push(`sport = $${params.length}`);
  }

  const safeMinStake = Math.max(Number(minStake) || 0, 0);
  if (safeMinStake > 0) {
    params.push(safeMinStake);
    whereClauses.push(`stake >= $${params.length}`);
  }

  const safeSearch = search.trim();
  if (safeSearch) {
    params.push(`%${safeSearch}%`);
    whereClauses.push(`(
      event ILIKE $${params.length}
      OR sport ILIKE $${params.length}
      OR bet_type ILIKE $${params.length}
      OR selection ILIKE $${params.length}
      OR id::text ILIKE $${params.length}
    )`);
  }

  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

  const sortFieldMap = {
    betCount: "bet_count",
    totalStake: "total_stake",
    totalExposure: "total_exposure",
    lastBetPlacedAt: "last_bet_placed_at",
    odds: "odds",
  };

  const safeSortField = sortFieldMap[sortField] ?? "total_exposure";
  const safeSortOrder = String(sortOrder).toLowerCase() === "asc" ? "ASC" : "DESC";
  const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const summaryQuery = `
    WITH grouped AS (
      SELECT
        sport,
        event,
        bet_type AS market,
        selection,
        odd::float8 AS odds,
        COUNT(*)::int AS bet_count,
        SUM(stake)::float8 AS total_stake,
        SUM(potential_profit)::float8 AS total_exposure,
        MAX(timestamp) AS last_bet_placed_at
      FROM bets
      ${whereSql}
      GROUP BY sport, event, bet_type, selection, odd
    )
    SELECT
      COUNT(*)::int AS total_groups,
      COALESCE(SUM(bet_count), 0)::int AS total_bets,
      COALESCE(SUM(total_exposure), 0)::float8 AS total_exposure
    FROM grouped
  `;

  const rowsQueryParams = [...params, safeLimit, safeOffset];
  const rowsQuery = `
    WITH grouped AS (
      SELECT
        sport,
        event,
        bet_type AS market,
        selection,
        odd::float8 AS odds,
        COUNT(*)::int AS bet_count,
        SUM(stake)::float8 AS total_stake,
        SUM(potential_profit)::float8 AS total_exposure,
        MAX(timestamp) AS last_bet_placed_at
      FROM bets
      ${whereSql}
      GROUP BY sport, event, bet_type, selection, odd
    )
    SELECT
      sport,
      event,
      market,
      selection,
      odds,
      bet_count,
      total_stake,
      total_exposure,
      last_bet_placed_at
    FROM grouped
    ORDER BY ${safeSortField} ${safeSortOrder}
    LIMIT $${rowsQueryParams.length - 1} OFFSET $${rowsQueryParams.length}
  `;

  const [{ rows: summaryRows }, { rows }] = await Promise.all([
    pool.query(summaryQuery, params),
    pool.query(rowsQuery, rowsQueryParams),
  ]);
  console.log(`Obtidos ${rows.length} grupos de apostas do PostgreSQL (total grupos: ${summaryRows[0]?.total_groups ?? 0}, total bets: ${summaryRows[0]?.total_bets ?? 0}).`);

  return {
    totalGroups: summaryRows[0]?.total_groups ?? 0,
    totalBets: summaryRows[0]?.total_bets ?? 0,
    totalExposure: summaryRows[0]?.total_exposure ?? 0,
    groups: rows,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function getMaxId() {
  if (!pool) return 0;
  const { rows } = await pool.query("SELECT MAX(id) AS max_id FROM bets");
  return parseInt(rows[0].max_id) || 0;
}

export async function truncateBets() {
  if (!pool) {
    throw new Error("PostgreSQL não está inicializado.");
  }

  const { rows } = await pool.query("SELECT COUNT(*)::int AS total FROM bets");
  const total = rows[0]?.total ?? 0;

  await pool.query("TRUNCATE TABLE bets;");

  return total;
}