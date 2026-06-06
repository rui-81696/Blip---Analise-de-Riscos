import {
  getBetById,
  getBetsInRange,
  getDistinctSports,
  getGroupedBets,
  getLatestBets,
  getStakeDistribution,
  isPostgresEnabled,
} from "../db/postgres.js";

function postgresDisabledResponse(res) {
  return res.status(503).json({
    error: "PostgreSQL está desativado. Ativa POSTGRES_ENABLED=true para usar este endpoint.",
  });
}

export async function handleGetLatestBets(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  try {
    const data = await getLatestBets({
      limit: req.query.limit,
      offset: req.query.offset,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter apostas da base de dados.",
      detail: error.message,
    });
  }
}

export async function handleGetGroupedBets(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  try {
    const data = await getGroupedBets({
      search: req.query.search,
      sport: req.query.sport,
      minOdds: req.query.minOdds,
      maxOdds: req.query.maxOdds,
      minStake: req.query.minStake,
      maxStake: req.query.maxStake,
      minBets: req.query.minBets,
      timeRange: req.query.timeRange,
      sortField: req.query.sortField,
      sortOrder: req.query.sortOrder,
      limit: req.query.limit,
      offset: req.query.offset,
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter grupos de apostas da base de dados.",
      detail: error.message,
    });
  }
}

export async function handleGetSports(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  try {
    const sports = await getDistinctSports();
    return res.json({ sports });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter a lista de desportos.",
      detail: error.message,
    });
  }
}

export async function handleGetStakeDistribution(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  const { sport, event, betType, selection, odd, timeRange, ranges } = req.body || {};

  if (!sport || !event || !betType || !selection || odd === undefined || odd === null) {
    return res.status(400).json({
      error: "Campos obrigatórios em falta (sport, event, betType, selection, odd).",
    });
  }

  try {
    const data = await getStakeDistribution({
      sport,
      event,
      betType,
      selection,
      odd,
      timeRange,
      ranges: Array.isArray(ranges) ? ranges : [],
    });

    return res.json(data);
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao calcular a distribuição de stakes.",
      detail: error.message,
    });
  }
}

export async function handleGetBetsRange(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  try {
    const bets = await getBetsInRange({
      period: req.query.period,
      sport: req.query.sport,
      betType: req.query.betType,
      event: req.query.event,
      selection: req.query.selection,
      search: req.query.search,
      limit: req.query.limit,
    });

    return res.json({ bets });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter apostas no período pedido.",
      detail: error.message,
    });
  }
}

export async function handleGetBetById(req, res) {
  if (!isPostgresEnabled()) {
    return postgresDisabledResponse(res);
  }

  try {
    const bet = await getBetById(req.params.id);

    if (!bet) {
      return res.status(404).json({ error: "Aposta não encontrada." });
    }

    return res.json({ bet });
  } catch (error) {
    return res.status(500).json({
      error: "Falha ao obter aposta da base de dados.",
      detail: error.message,
    });
  }
}