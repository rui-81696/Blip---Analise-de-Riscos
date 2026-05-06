import { getBetById, getGroupedBets, getLatestBets, isPostgresEnabled } from "../db/postgres.js";

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
      minStake: req.query.minStake,
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