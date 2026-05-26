import { getSummary, getBySport, getByPeriod, getByRisk } from "../services/statsService.js";

/**
 * GET /api/stats/summary
 * Retorna resumo de estatísticas gerais
 */
export async function handleGetSummary(req, res) {
  try {
    const { period = "24h" } = req.query;

    // Validar período
    const validPeriods = ["1h", "24h", "7d", "today", "yesterday"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        error: "Período inválido. Use: 1h, 24h, 7d ou today",
      });
    }

    const data = await getSummary({ period });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao obter resumo de estatísticas",
      detail: error.message,
    });
  }
}

/**
 * GET /api/stats/by-sport
 * Retorna estatísticas agrupadas por desporto
 */
export async function handleGetBySport(req, res) {
  try {
    const { period = "24h", limit = 500, sort = "totalExposure" } = req.query;

    // Validar período
    const validPeriods = ["1h", "24h", "7d", "today", "yesterday"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        error: "Período inválido. Use: 1h, 24h, 7d ou today",
      });
    }

    const data = await getBySport({
      period,
      limit: Number(limit),
      sort,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao obter estatísticas por desporto",
      detail: error.message,
    });
  }
}

/**
 * GET /api/stats/by-period
 * Retorna série temporal de estatísticas
 */
export async function handleGetByPeriod(req, res) {
  try {
    const { from, to, granularity = "hour" } = req.query;

    if (!from || !to) {
      return res.status(400).json({
        error: "Parâmetros 'from' e 'to' são obrigatórios (formato ISO)",
      });
    }

    // Validar formato ISO
    if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
      return res.status(400).json({
        error: "Datas inválidas. Use formato ISO (ex: 2024-01-01T00:00:00Z)",
      });
    }

    const validGranularities = ["minute", "hour", "day"];
    if (!validGranularities.includes(granularity)) {
      return res.status(400).json({
        error: "Granularidade inválida. Use: minute, hour ou day",
      });
    }

    const data = await getByPeriod({
      from,
      to,
      granularity,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao obter estatísticas por período",
      detail: error.message,
    });
  }
}

/**
 * GET /api/stats/by-risk
 * Retorna distribuição de risco
 */
export async function handleGetByRisk(req, res) {
  try {
    const { period = "24h" } = req.query;

    // Validar período
    const validPeriods = ["1h", "24h", "7d", "today", "yesterday"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        error: "Período inválido. Use: 1h, 24h, 7d ou today",
      });
    }

    const data = await getByRisk({ period });
    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao obter distribuição de risco",
      detail: error.message,
    });
  }
}
