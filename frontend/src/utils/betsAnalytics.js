function formatCurrency(value) {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDateTime(isoDate) {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return "data inválida";
  }

  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRiskBucket(score) {
  const value = Number(score) || 0;

  if (value < 25) return "low";
  if (value < 50) return "medium";
  if (value < 75) return "high";
  return "critical";
}

function sortByExposureThenCount(left, right) {
  if (right.totalExposure !== left.totalExposure) {
    return right.totalExposure - left.totalExposure;
  }

  if (right.betCount !== left.betCount) {
    return right.betCount - left.betCount;
  }

  return left.sport.localeCompare(right.sport);
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .toLowerCase()
    .trim();
}

function getSportAliases(sportName) {
  const normalized = normalizeText(sportName);

  if (normalized.includes("football") || normalized.includes("futebol")) {
    return ["football", "futebol", "footbal", "footabll", "futebal", "bola"];
  }

  if (normalized.includes("basketball") || normalized.includes("basquetebol")) {
    return ["basketball", "basquetebol", "basket", "basquete", "basquet"];
  }

  if (normalized.includes("tennis") || normalized.includes("tenis") || normalized.includes("tenis")) {
    return ["tennis", "tenis", "tenniss", "tenns"];
  }

  return [normalized];
}

function levenshteinDistance(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a) return b.length;
  if (!b) return a.length;

  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let row = 0; row <= a.length; row += 1) dp[row][0] = row;
  for (let col = 0; col <= b.length; col += 1) dp[0][col] = col;

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      dp[row][col] = Math.min(
        dp[row - 1][col] + 1,
        dp[row][col - 1] + 1,
        dp[row - 1][col - 1] + cost,
      );
    }
  }

  return dp[a.length][b.length];
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function parseThresholdQuery(question) {
  const normalizedQuestion = normalizeText(question);

  const match = normalizedQuestion.match(/(mais de|acima de|superior a|maior que|greater than|over|menos de|abaixo de|inferior a|lower than|under)\s*(\d+(?:[.,]\d+)?)/);
  if (!match) {
    return null;
  }

  const comparatorText = match[1];
  const threshold = Number(String(match[2]).replace(",", "."));
  if (!Number.isFinite(threshold)) {
    return null;
  }

  const mode = includesAny(comparatorText, ["menos de", "abaixo de", "inferior a", "lower than", "under"]) ? "below" : "above";
  let metric = null;

  if (includesAny(normalizedQuestion, ["odd", "odds", "cotacao", "cotação"])) {
    metric = "odd";
  } else if (includesAny(normalizedQuestion, ["stake", "aposta", "apostas"])) {
    metric = "stake";
  } else if (includesAny(normalizedQuestion, ["exposicao", "exposição", "exposure"])) {
    metric = "exposure";
  } else if (includesAny(normalizedQuestion, ["risco", "risk"])) {
    metric = "risk";
  }

  return metric ? { mode, threshold, metric } : null;
}

function parseRelativeTimeWindow(question) {
  const normalizedQuestion = normalizeText(question);
  const match = normalizedQuestion.match(/(?:ultimas|últimas|ultimos|últimos|nos ultimos|nas ultimas|nos últimos|nas últimas)\s*(\d+)\s*(minutos?|horas?|dias?)/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  if (unit.startsWith("min")) {
    return { amount, unit: "minutes" };
  }

  if (unit.startsWith("hor")) {
    return { amount, unit: "hours" };
  }

  return { amount, unit: "days" };
}

function isWithinRelativeWindow(timestamp, window) {
  if (!timestamp || !window) {
    return false;
  }

  const betTime = new Date(timestamp).getTime();
  if (!Number.isFinite(betTime)) {
    return false;
  }

  const now = Date.now();
  const windowMs = window.unit === "minutes"
    ? window.amount * 60 * 1000
    : window.unit === "hours"
      ? window.amount * 60 * 60 * 1000
      : window.amount * 24 * 60 * 60 * 1000;

  return betTime >= now - windowMs && betTime <= now;
}

function findEntryByQuestion(question, entries, fieldName) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion || !Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const questionTokens = normalizedQuestion.split(/\s+/).filter(Boolean);

  for (const entry of entries) {
    const name = normalizeText(entry?.[fieldName]);
    if (!name) {
      continue;
    }

    if (normalizedQuestion.includes(name)) {
      return entry;
    }

    const words = name.split(/\s+/).filter(Boolean);
    const matchByWord = words.some((word) => word.length >= 4 && normalizedQuestion.includes(word));
    if (matchByWord) {
      return entry;
    }

    const fuzzyMatch = questionTokens.some((token) => {
      if (token.length < 5) {
        return false;
      }

      return levenshteinDistance(token, name) <= 2;
    });

    if (fuzzyMatch) {
      return entry;
    }
  }

  return null;
}

function findSportByQuestion(question, sports) {
  const normalizedQuestion = normalizeText(question);
  if (!normalizedQuestion || !Array.isArray(sports) || sports.length === 0) {
    return null;
  }

  const questionTokens = normalizedQuestion.split(/\s+/).filter(Boolean);

  for (const sport of sports) {
    const sportName = normalizeText(sport?.sport);
    if (!sportName) {
      continue;
    }

    const aliases = getSportAliases(sportName);

    if (aliases.some((alias) => normalizedQuestion.includes(alias))) {
      return sport;
    }

    // Accept close typos like "footabll" for "football".
    const fuzzyMatch = questionTokens.some((token) => {
      if (token.length < 5) {
        return false;
      }

      return aliases.some((alias) => {
        if (Math.abs(alias.length - token.length) > 2) {
          return false;
        }

        return levenshteinDistance(alias, token) <= 2;
      });
    });

    if (fuzzyMatch) {
      return sport;
    }
  }

  return null;
}

export function computeAssistantAnalytics(bets, params = {}) {
  const safeBets = Array.isArray(bets) ? bets.filter(Boolean) : [];
  const totalBets = safeBets.length;
  const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 10);

  const summary = {
    totalBets,
    totalStake: 0,
    totalExposure: 0,
    averageOdd: 0,
    averageRiskScore: 0,
    latestBetAt: null,
  };

  const sportsMap = new Map();
  const eventsMap = new Map();
  const selectionsMap = new Map();
  const riskBuckets = {
    low: { label: "Baixo", count: 0, stake: 0, exposure: 0 },
    medium: { label: "Médio", count: 0, stake: 0, exposure: 0 },
    high: { label: "Alto", count: 0, stake: 0, exposure: 0 },
    critical: { label: "Crítico", count: 0, stake: 0, exposure: 0 },
  };

  for (const bet of safeBets) {
    const stake = Number(bet.stake) || 0;
    const odd = Number(bet.odd) || 0;
    const exposure = Number(bet.potentialProfit ?? bet.exposureRisk) || 0;
    const riskScore = Number(bet.riskScore ?? bet.exposureRisk) || 0;
    const betTime = new Date(bet.timestamp).getTime();

    summary.totalStake += stake;
    summary.totalExposure += exposure;
    summary.averageOdd += odd;
    summary.averageRiskScore += riskScore;

    if (!summary.latestBetAt || betTime > new Date(summary.latestBetAt).getTime()) {
      summary.latestBetAt = bet.timestamp;
    }

    const compactBet = {
      sport: bet.sport || "Desconhecido",
      event: bet.event || "Evento desconhecido",
      selection: bet.selection || "Seleção desconhecida",
      stake,
      odd,
      riskScore,
      exposure,
      timestamp: bet.timestamp,
    };

    if (!summary.highestStakeBet || stake > summary.highestStakeBet.stake) {
      summary.highestStakeBet = compactBet;
    }

    if (!summary.highestOddBet || odd > summary.highestOddBet.odd) {
      summary.highestOddBet = compactBet;
    }

    if (!summary.highestRiskBet || riskScore > summary.highestRiskBet.riskScore) {
      summary.highestRiskBet = compactBet;
    }

    const sportName = bet.sport || "Desconhecido";
    const currentSport = sportsMap.get(sportName) || {
      sport: sportName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      averageOdd: 0,
      lastBetAt: null,
    };

    currentSport.betCount += 1;
    currentSport.totalStake += stake;
    currentSport.totalExposure += exposure;
    currentSport.averageOdd += odd;

    if (!currentSport.lastBetAt || betTime > new Date(currentSport.lastBetAt).getTime()) {
      currentSport.lastBetAt = bet.timestamp;
    }

    sportsMap.set(sportName, currentSport);

    const eventName = bet.event || "Evento desconhecido";
    const currentEvent = eventsMap.get(eventName) || {
      event: eventName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
    };
    currentEvent.betCount += 1;
    currentEvent.totalStake += stake;
    currentEvent.totalExposure += exposure;
    eventsMap.set(eventName, currentEvent);

    const selectionName = bet.selection || "Seleção desconhecida";
    const currentSelection = selectionsMap.get(selectionName) || {
      selection: selectionName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
    };
    currentSelection.betCount += 1;
    currentSelection.totalStake += stake;
    currentSelection.totalExposure += exposure;
    selectionsMap.set(selectionName, currentSelection);

    const bucketKey = getRiskBucket(riskScore);
    const bucket = riskBuckets[bucketKey];
    bucket.count += 1;
    bucket.stake += stake;
    bucket.exposure += exposure;
  }

  const allSports = Array.from(sportsMap.values())
    .map((sport) => ({
      ...sport,
      averageOdd: sport.betCount > 0 ? sport.averageOdd / sport.betCount : 0,
    }))
    .sort(sortByExposureThenCount);

  const sports = allSports.slice(0, limit);

  const allEvents = Array.from(eventsMap.values())
    .sort((left, right) => right.betCount - left.betCount);

  const allSelections = Array.from(selectionsMap.values())
    .sort((left, right) => right.betCount - left.betCount);

  const topEvents = allEvents.slice(0, 12);
  const topSelections = allSelections.slice(0, 12);

  summary.averageOdd = totalBets > 0 ? summary.averageOdd / totalBets : 0;
  summary.averageRiskScore = totalBets > 0 ? summary.averageRiskScore / totalBets : 0;

  const recentBets = [...safeBets]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 5)
    .map((bet) => ({
      sport: bet.sport || "Desconhecido",
      event: bet.event || "Evento desconhecido",
      selection: bet.selection || "Seleção desconhecida",
      stake: Number(bet.stake) || 0,
      odd: Number(bet.odd) || 0,
      timestamp: bet.timestamp,
      riskScore: Number(bet.riskScore ?? bet.exposureRisk) || 0,
    }));

  return {
    summary,
    allBets: safeBets,
    sports,
    allSports,
    allEvents,
    allSelections,
    topEvents,
    topSelections,
    riskBuckets,
    recentBets,
    period: params.period || "24h",
  };
}

export function buildDeterministicReply(question, analytics) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) {
    return "";
  }

  const normalizedQuestion = normalizeText(cleanQuestion);
  const { summary, allSports = [], allEvents = [], allSelections = [], riskBuckets, recentBets = [] } = analytics;
  const asksEvent = includesAny(normalizedQuestion, ["evento", "jogo", "partida", "match"]);
  const asksSelection = includesAny(normalizedQuestion, ["selecao", "selection", "equipa", "time", "team", "jogador", "pick", "opcao"]);
  const thresholdQuery = parseThresholdQuery(cleanQuestion);
  const relativeWindow = parseRelativeTimeWindow(cleanQuestion);

  if (relativeWindow && includesAny(normalizedQuestion, ["quantas", "quantos", "qtd", "numero", "número", "aposta", "apostas", "feitas", "realizadas", "criadas", "existem"])) {
    const windowBets = (analytics.allBets || analytics.bets || recentBets)
      .filter((bet) => isWithinRelativeWindow(bet?.timestamp, relativeWindow));

    const unitLabel = relativeWindow.unit === "minutes"
      ? relativeWindow.amount === 1 ? "minuto" : "minutos"
      : relativeWindow.unit === "hours"
        ? relativeWindow.amount === 1 ? "hora" : "horas"
        : relativeWindow.amount === 1 ? "dia" : "dias";

    return windowBets.length > 0
      ? `Há ${windowBets.length} apostas nas últimas ${relativeWindow.amount} ${unitLabel}.`
      : `Não há apostas nas últimas ${relativeWindow.amount} ${unitLabel}.`;
  }

  if (thresholdQuery) {
    const matchingBets = (analytics.allBets || analytics.bets || recentBets)
      .filter((bet) => {
        const stake = Number(bet?.stake) || 0;
        const odd = Number(bet?.odd) || 0;
        const exposure = Number(bet?.potentialProfit ?? bet?.exposureRisk) || 0;
        const risk = Number(bet?.riskScore ?? bet?.exposureRisk) || 0;
        const valueByMetric = {
          stake,
          odd,
          exposure,
          risk,
        }[thresholdQuery.metric] || 0;

        return thresholdQuery.mode === "above"
          ? valueByMetric > thresholdQuery.threshold
          : valueByMetric < thresholdQuery.threshold;
      });

    const comparatorLabel = thresholdQuery.mode === "above" ? "mais de" : "menos de";
    const metricLabel = thresholdQuery.metric === "odd"
      ? "odd"
      : thresholdQuery.metric === "stake"
        ? "stake"
        : thresholdQuery.metric === "exposure"
          ? "exposição"
          : "risco";

    const formattedThreshold = thresholdQuery.metric === "odd" || thresholdQuery.metric === "risk"
      ? thresholdQuery.threshold.toFixed(2)
      : formatCurrency(thresholdQuery.threshold);

    return `Há ${matchingBets.length} apostas com ${metricLabel} ${comparatorLabel} ${formattedThreshold}.`;
  }

  if (includesAny(normalizedQuestion, ["media odd", "odd media", "odd media", "odd media", "media de odd"])) {
    return `Odd média atual: ${summary.averageOdd.toFixed(2)}.`;
  }

  if (includesAny(normalizedQuestion, ["media risco", "risco medio", "media de risco"])) {
    return `Risco médio atual: ${summary.averageRiskScore.toFixed(2)}.`;
  }

  if (includesAny(normalizedQuestion, ["total stake", "stake total", "quanto stake", "soma stake"])) {
    return `Stake total: ${formatCurrency(summary.totalStake)}.`;
  }

  if (includesAny(normalizedQuestion, ["total exposicao", "exposicao total", "soma exposicao", "quanto exposicao"])) {
    return `Exposição total: ${formatCurrency(summary.totalExposure)}.`;
  }

  if (normalizedQuestion.includes("total") && normalizedQuestion.includes("aposta")) {
    return `Total de apostas: ${summary.totalBets}.`;
  }

  if (includesAny(normalizedQuestion, ["ultima aposta", "mais recente", "ultima entrada", "aposta recente"])) {
    const latest = recentBets[0];
    if (!latest) {
      return "Sem apostas recentes.";
    }

    return `Última aposta: ${latest.sport} | ${latest.event} | ${latest.selection}, stake ${formatCurrency(latest.stake)}, odd ${latest.odd.toFixed(2)}, às ${formatDateTime(latest.timestamp)}.`;
  }

  if (includesAny(normalizedQuestion, ["maior stake", "mais stake", "stake mais alto", "aposta mais alta", "aposta com mais stake"])) {
    const topStake = summary.highestStakeBet;
    if (!topStake) {
      return "Sem dados para calcular maior stake.";
    }

    return `Maior stake: ${formatCurrency(topStake.stake)} em ${topStake.sport} (${topStake.selection}) no evento ${topStake.event}.`;
  }

  if (includesAny(normalizedQuestion, ["maior odd", "odd mais alta"])) {
    const topOdd = summary.highestOddBet;
    if (!topOdd) {
      return "Sem dados para calcular maior odd.";
    }

    return `Maior odd: ${topOdd.odd.toFixed(2)} em ${topOdd.sport} (${topOdd.selection}) no evento ${topOdd.event}.`;
  }

  if (includesAny(normalizedQuestion, ["maior risco", "risco mais alto"])) {
    const topRisk = summary.highestRiskBet;
    if (!topRisk) {
      return "Sem dados para calcular maior risco.";
    }

    return `Maior risco: ${topRisk.riskScore.toFixed(2)} em ${topRisk.sport} (${topRisk.selection}) no evento ${topRisk.event}.`;
  }

  if (includesAny(normalizedQuestion, ["risco baixo", "baixo risco"])) {
    return `Risco baixo: ${riskBuckets.low.count} apostas.`;
  }

  if (includesAny(normalizedQuestion, ["risco medio", "risco médio", "medio risco", "médio risco"])) {
    return `Risco médio: ${riskBuckets.medium.count} apostas.`;
  }

  if (includesAny(normalizedQuestion, ["risco alto", "alto risco"])) {
    return `Risco alto: ${riskBuckets.high.count} apostas.`;
  }

  if (normalizedQuestion.includes("maior desporto") || normalizedQuestion.includes("top desporto") || normalizedQuestion.includes("desporto com mais")) {
    const topSport = allSports[0];
    if (!topSport) {
      return "Sem dados de desportos para analisar.";
    }

    return `Desporto com maior exposição: ${topSport.sport}, com ${topSport.betCount} apostas e ${formatCurrency(topSport.totalExposure)} de exposição.`;
  }

  if (normalizedQuestion.includes("risco critico") || normalizedQuestion.includes("critico")) {
    const critical = riskBuckets?.critical;
    if (!critical) {
      return "Sem dados de risco crítico.";
    }

    return `Risco crítico: ${critical.count} apostas, ${formatCurrency(critical.stake)} em stake e ${formatCurrency(critical.exposure)} de exposição.`;
  }

  const matchedSport = findSportByQuestion(cleanQuestion, allSports);

  if (matchedSport) {
    if (normalizedQuestion.includes("quantas") || normalizedQuestion.includes("numero") || normalizedQuestion.includes("qtd") || normalizedQuestion.includes("aposta")) {
      return `${matchedSport.sport}: ${matchedSport.betCount} apostas.`;
    }

    if (normalizedQuestion.includes("exposicao")) {
      return `${matchedSport.sport}: exposição total de ${formatCurrency(matchedSport.totalExposure)}.`;
    }

    if (normalizedQuestion.includes("stake")) {
      return `${matchedSport.sport}: stake total de ${formatCurrency(matchedSport.totalStake)}.`;
    }

    return `${matchedSport.sport}: ${matchedSport.betCount} apostas, ${formatCurrency(matchedSport.totalStake)} em stake e ${formatCurrency(matchedSport.totalExposure)} de exposição.`;
  }

  if (asksEvent) {
    const matchedEvent = findEntryByQuestion(cleanQuestion, allEvents, "event");
    if (matchedEvent) {
      return `Evento ${matchedEvent.event}: ${matchedEvent.betCount} apostas, ${formatCurrency(matchedEvent.totalStake)} em stake e ${formatCurrency(matchedEvent.totalExposure)} de exposição.`;
    }
  }

  if (asksSelection) {
    const matchedSelection = findEntryByQuestion(cleanQuestion, allSelections, "selection");
    if (matchedSelection) {
      return `Seleção ${matchedSelection.selection}: ${matchedSelection.betCount} apostas, ${formatCurrency(matchedSelection.totalStake)} em stake e ${formatCurrency(matchedSelection.totalExposure)} de exposição.`;
    }
  }

  if (includesAny(normalizedQuestion, ["resumo", "sumario", "sumario", "overview", "geral"])) {
    return `Resumo: ${summary.totalBets} apostas, stake total ${formatCurrency(summary.totalStake)}, exposição ${formatCurrency(summary.totalExposure)} e odd média ${summary.averageOdd.toFixed(2)}.`;
  }

  return "";
}

export function formatAssistantReply(intent, analytics, question = "") {
  const { summary, sports, riskBuckets, recentBets, period } = analytics;

  if (!summary.totalBets) {
    return "Ainda não há apostas guardadas no frontend para analisar.";
  }

    const deterministic = buildDeterministicReply(question, analytics);
    if (deterministic) {
      return deterministic;
    }

  if (intent === "recent") {
    if (!recentBets || recentBets.length === 0) return "Sem apostas recentes.";
    return `Últimas 5 apostas:\n` + recentBets
      .slice(0, 5)
      .map((b) => `${formatDateTime(b.timestamp)} — ${b.sport} — ${b.selection} — €${b.stake} — odd ${b.odd.toFixed(2)}`)
      .join("\n");
  }

  if (intent === "top-stake") {
    // find top bets by stake
    const top = analytics.recentBets && analytics.recentBets.length > 0 ? analytics.recentBets : [];
    if (top.length === 0) return "Sem dados de stakes recentes.";
    const sorted = [...top].sort((a, b) => b.stake - a.stake).slice(0, 5);
    return `Top 5 apostas por stake:\n` + sorted.map((b) => `${b.sport} ${b.selection}: €${b.stake}`).join("\n");
  }

  if (intent === "by-risk" && analytics && analytics.riskBuckets && analytics.riskBuckets.critical && analytics.riskBuckets.critical.count > 0 && analytics.params?.focus === "critical") {
    const c = analytics.riskBuckets.critical;
    return `Risco crítico: ${c.count} apostas, stake total €${c.stake.toFixed(2)}, exposição €${c.exposure.toFixed(2)}.`;
  }

  if (intent === "by-sport") {
    const topSports = sports.slice(0, 3);
    const sportText = topSports
      .map((sport) => `${sport.sport}: ${sport.betCount} apostas, ${formatCurrency(sport.totalExposure)} de exposição`)
      .join("; ");

    return `${summary.totalBets} apostas no período ${period}. Top desportos: ${sportText}.`;
  }

  if (intent === "by-risk") {
    return `Risco — baixo: ${riskBuckets.low.count}, médio: ${riskBuckets.medium.count}, alto: ${riskBuckets.high.count}, crítico: ${riskBuckets.critical.count}.`;
  }

  const latestSummary = recentBets.length > 0
    ? `Última aposta: ${formatDateTime(recentBets[0].timestamp)}.`
    : "";

  return `Total ${summary.totalBets} apostas. Stake €${formatCurrency(summary.totalStake)}, exposição €${formatCurrency(summary.totalExposure)}, odd média ${summary.averageOdd.toFixed(2)}. ${latestSummary}`.trim();
}

export function buildAssistantContext(question, intent, params, analytics) {
  return {
    question,
    intent,
    params,
    analytics: {
      summary: analytics.summary,
      sports: (analytics.allSports || analytics.sports).slice(0, 8),
      topEvents: analytics.topEvents,
      topSelections: analytics.topSelections,
      riskBuckets: analytics.riskBuckets,
      recentBets: analytics.recentBets,
    },
  };
}
