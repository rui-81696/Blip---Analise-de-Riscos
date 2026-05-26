import { getBetsInRange, isPostgresEnabled } from "../db/postgres.js";
import { buildBetAnalytics } from "./betAnalytics.js";

const VALID_PERIODS = new Set(["1h", "24h", "7d", "today", "yesterday"]);

function normalizePeriod(period = "24h") {
  const safePeriod = String(period || "24h");
  return VALID_PERIODS.has(safePeriod) ? safePeriod : "24h";
}

function getTimeBucketKey(timestamp, granularity) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  if (granularity === "minute") {
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  if (granularity === "hour") {
    return `${year}-${month}-${day} ${hour}:00`;
  }

  return `${year}-${month}-${day}`;
}

function buildTimeSeries(bets, granularity) {
  const buckets = new Map();

  for (const bet of bets) {
    const key = getTimeBucketKey(bet.timestamp, granularity);
    if (!key) {
      continue;
    }

    const current = buckets.get(key) || {
      timestamp: key,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      totalOdd: 0,
    };

    current.betCount += 1;
    current.totalStake += Number(bet.stake) || 0;
    current.totalExposure += Number(bet.potentialProfit ?? bet.exposureRisk) || 0;
    current.totalOdd += Number(bet.odd) || 0;
    buckets.set(key, current);
  }

  return Array.from(buckets.values())
    .sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)))
    .map((entry) => ({
      ...entry,
      averageOdd: entry.betCount > 0 ? entry.totalOdd / entry.betCount : 0,
    }));
}

function sortArrayByField(items, sortField) {
  const field = String(sortField || "totalExposure");

  return [...items].sort((left, right) => {
    if (field === "betCount") {
      if (right.betCount !== left.betCount) return right.betCount - left.betCount;
      if (right.totalExposure !== left.totalExposure) return right.totalExposure - left.totalExposure;
    }

    if (field === "totalStake") {
      if (right.totalStake !== left.totalStake) return right.totalStake - left.totalStake;
      if (right.betCount !== left.betCount) return right.betCount - left.betCount;
    }

    if (field === "lastBetAt") {
      return String(right.lastBetAt || "").localeCompare(String(left.lastBetAt || ""));
    }

    if (right.totalExposure !== left.totalExposure) return right.totalExposure - left.totalExposure;
    if (right.betCount !== left.betCount) return right.betCount - left.betCount;

    return String(left.sport || left.betType || left.event || left.selection || "")
      .localeCompare(String(right.sport || right.betType || right.event || right.selection || ""));
  });
}

async function loadAnalytics({ period = "24h", limit = 200000, sport } = {}) {
  const bets = await getBetsInRange({
    period: normalizePeriod(period),
    sport,
    limit,
  });

  return buildBetAnalytics(bets);
}

export async function getSummary({ period = "24h" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    const analytics = await loadAnalytics({ period });
    const { summary } = analytics;

    return {
      totalBets: summary.totalBets,
      totalStake: summary.totalStake,
      totalExposure: summary.totalExposure,
      profitLoss: -summary.totalExposure,
      averageOdd: summary.averageOdd,
      averageRiskScore: summary.averageRiskScore,
      period: normalizePeriod(period),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter resumo: ${error.message}`);
  }
}

export async function getBySport({ period = "24h", limit = 500, sort = "totalExposure" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    const analytics = await loadAnalytics({ period, limit: 200000 });
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);

    return {
      period: normalizePeriod(period),
      sports: sortArrayByField(analytics.sports, sort).slice(0, safeLimit),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter stats por desporto: ${error.message}`);
  }
}

export async function getByPeriod({ from, to, granularity = "hour" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  if (!from || !to) {
    throw new Error("Parâmetros 'from' e 'to' são obrigatórios.");
  }

  try {
    const bets = await getBetsInRange({ from, to, limit: 1000000 });
    return {
      from,
      to,
      granularity,
      data: buildTimeSeries(bets, granularity),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter stats por período: ${error.message}`);
  }
}

export async function getByRisk({ period = "24h" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    const analytics = await loadAnalytics({ period });
    return {
      period: normalizePeriod(period),
      riskBuckets: analytics.riskBuckets,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter stats por risco: ${error.message}`);
  }
}

export async function getDetailedAnalytics(options = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  const analytics = await loadAnalytics(options);
  return analytics;
}
