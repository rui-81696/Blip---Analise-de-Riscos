const STORAGE_KEY = "blip-risk:stored-bets:v1";

const ONE_MINUTE_MS = 60 * 1000;

/**
 * Timestamp (ms) inicial da janela temporal para um dado intervalo.
 *
 * `timeRange === -1` significa "Hoje" (desde o início do dia atual).
 * Qualquer outro valor é interpretado como número de minutos para trás
 * a partir de agora (ex.: 60 = última hora, 10080 = 7 dias, 43200 = 30 dias).
 *
 * Usado tanto pela tabela como pelo popover de análise para garantir que
 * filtram exatamente a mesma janela temporal.
 */
export function getRangeStartMs(timeRange) {
  if (Number(timeRange) === -1) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return todayStart.getTime();
  }

  return Date.now() - Number(timeRange) * ONE_MINUTE_MS;
}

export function normalizeBet(rawBet) {
  return {
    id: rawBet.id,
    sport: rawBet.sport,
    event: rawBet.event,
    betType: rawBet.betType || rawBet.bet_type,
    selection: rawBet.selection,
    odd: Number(rawBet.odd),
    stake: Number(rawBet.stake),
    riskScore: Number(rawBet.riskScore ?? rawBet.risk_score ?? 0),
    exposureRisk: Number(rawBet.exposureRisk ?? rawBet.exposure_risk ?? 0),
    timestamp: rawBet.timestamp,
    potentialPayout: Number(rawBet.potentialPayout ?? rawBet.potential_payout ?? 0),
    potentialProfit: Number(rawBet.potentialProfit ?? rawBet.potential_profit ?? 0),
  };
}

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function sanitizeBet(bet) {
  if (!bet || bet.id === undefined || bet.id === null || !bet.timestamp) {
    return null;
  }

  return normalizeBet(bet);
}

function readBetsFromStorage() {
  if (!isBrowser()) {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map(sanitizeBet).filter(Boolean).sort((left, right) => {
      const leftTime = new Date(left.timestamp).getTime();
      const rightTime = new Date(right.timestamp).getTime();

      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }

      return Number(left.id) - Number(right.id);
    });
  } catch {
    return [];
  }
}

function writeBetsToStorage(bets) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bets));
  } catch (error) {
    console.warn("Falha ao guardar apostas no armazenamento local:", error);
  }
}

export function loadStoredBets() {
  return readBetsFromStorage();
}

export function appendStoredBets(newBets) {
  const incomingBets = Array.isArray(newBets)
    ? newBets.map(sanitizeBet).filter(Boolean)
    : [];

  if (incomingBets.length === 0) {
    return loadStoredBets();
  }

  const merged = new Map();

  for (const bet of readBetsFromStorage()) {
    merged.set(String(bet.id), bet);
  }

  for (const bet of incomingBets) {
    merged.set(String(bet.id), bet);
  }

  const mergedBets = Array.from(merged.values()).sort((left, right) => {
    const leftTime = new Date(left.timestamp).getTime();
    const rightTime = new Date(right.timestamp).getTime();

    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return Number(left.id) - Number(right.id);
  });

  writeBetsToStorage(mergedBets);
  return mergedBets;
}
