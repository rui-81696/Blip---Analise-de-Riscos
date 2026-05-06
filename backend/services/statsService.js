import {
  getGroupedBets,
  getBetsCount,
  getLatestBets,
  isPostgresEnabled,
} from "../db/postgres.js";

/**
 * Retorna um resumo de estatísticas gerais
 * @param {Object} options - Opções de filtro
 * @param {string} options.period - Período: 'today', '1h', '24h', '7d'
 * @returns {Promise<Object>} Resumo com totalBets, totalStake, totalExposure, profitLoss
 */
export async function getSummary({ period = "24h" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    // Pega apostas agrupadas com um timeRange apropriado
    const timeRangeMap = {
      "1h": 60,
      "24h": 1440,
      "7d": 10080,
      today: -1,
    };

    const timeRange = timeRangeMap[period] ?? 1440;

    const data = await getGroupedBets({
      timeRange,
      limit: 10000,
    });

    return {
      totalBets: data.totalBets,
      totalStake: data.groups.reduce((sum, g) => sum + (g.total_stake || 0), 0),
      totalExposure: data.totalExposure,
      profitLoss: -data.totalExposure,
      period,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter resumo: ${error.message}`);
  }
}

/**
 * Retorna estatísticas agrupadas por desporto
 * @param {Object} options - Opções de filtro
 * @param {string} options.period - Período: 'today', '1h', '24h', '7d'
 * @param {number} options.limit - Limite de resultados (max 1000)
 * @param {string} options.sort - Campo para ordenação
 * @returns {Promise<Object>} Array de grupos por desporto
 */
export async function getBySport({ period = "24h", limit = 500, sort = "totalExposure" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    const timeRangeMap = {
      "1h": 60,
      "24h": 1440,
      "7d": 10080,
      today: -1,
    };

    const timeRange = timeRangeMap[period] ?? 1440;
    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);

    const data = await getGroupedBets({
      timeRange,
      limit: safeLimit,
      sortField: sort,
      sortOrder: "desc",
    });

    // Agrupa por desporto
    const sportMap = {};
    data.groups.forEach((group) => {
      if (!sportMap[group.sport]) {
        sportMap[group.sport] = {
          sport: group.sport,
          betCount: 0,
          totalStake: 0,
          totalExposure: 0,
          events: [],
        };
      }
      sportMap[group.sport].betCount += group.bet_count;
      sportMap[group.sport].totalStake += group.total_stake;
      sportMap[group.sport].totalExposure += group.total_exposure;
      sportMap[group.sport].events.push(group);
    });

    return {
      period,
      sports: Object.values(sportMap),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter stats por desporto: ${error.message}`);
  }
}

/**
 * Retorna séries temporais de estatísticas
 * @param {Object} options - Opções de filtro
 * @param {string} options.from - Data inicial (ISO)
 * @param {string} options.to - Data final (ISO)
 * @param {string} options.granularity - Granularidade: 'minute', 'hour', 'day'
 * @returns {Promise<Array>} Array com série temporal
 */
export async function getByPeriod({ from, to, granularity = "hour" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  // Para esta fase, retorna um placeholder
  // Em futuro, implementar query temporal no DB
  return {
    from,
    to,
    granularity,
    data: [],
    note: "Será implementado com agregação temporal no DB",
  };
}

/**
 * Retorna distribuição de risco
 * @param {Object} options - Opções de filtro
 * @param {string} options.period - Período: 'today', '1h', '24h', '7d'
 * @returns {Promise<Object>} Distribuição por bucket de risco
 */
export async function getByRisk({ period = "24h" } = {}) {
  if (!isPostgresEnabled()) {
    throw new Error("PostgreSQL está desativado.");
  }

  try {
    const timeRangeMap = {
      "1h": 60,
      "24h": 1440,
      "7d": 10080,
      today: -1,
    };

    const timeRange = timeRangeMap[period] ?? 1440;

    const data = await getGroupedBets({
      timeRange,
      limit: 10000,
    });

    // Categoriza em buckets de risco (low, medium, high, critical)
    const riskBuckets = {
      low: { min: 0, max: 25, count: 0, exposure: 0 },
      medium: { min: 25, max: 50, count: 0, exposure: 0 },
      high: { min: 50, max: 75, count: 0, exposure: 0 },
      critical: { min: 75, max: 100, count: 0, exposure: 0 },
    };

    data.groups.forEach((group) => {
      // Nota: risk_score não está nesta estrutura, usaríamos exposureRisk como proxy
      const exposure = group.total_exposure || 0;
      const stake = group.total_stake || 0;
      const riskRatio = stake > 0 ? (Math.abs(exposure) / stake) * 100 : 0;

      if (riskRatio <= 25) {
        riskBuckets.low.count += group.bet_count;
        riskBuckets.low.exposure += exposure;
      } else if (riskRatio <= 50) {
        riskBuckets.medium.count += group.bet_count;
        riskBuckets.medium.exposure += exposure;
      } else if (riskRatio <= 75) {
        riskBuckets.high.count += group.bet_count;
        riskBuckets.high.exposure += exposure;
      } else {
        riskBuckets.critical.count += group.bet_count;
        riskBuckets.critical.exposure += exposure;
      }
    });

    return {
      period,
      riskBuckets,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Erro ao obter stats por risco: ${error.message}`);
  }
}
