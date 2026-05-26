function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function levenshteinDistance(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);

  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));

  for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row;
  for (let col = 0; col <= b.length; col += 1) matrix[0][col] = col;

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

function scoreEntryMatch(question, entryValue) {
  const normalizedQuestion = normalizeText(question);
  const normalizedEntry = normalizeText(entryValue);

  if (!normalizedQuestion || !normalizedEntry) {
    return 0;
  }

  let score = 0;
  const isShortGenericEntry = normalizedEntry.length <= 3 || ["yes", "no", "x", "1", "2"].includes(normalizedEntry);
  const stopwords = new Set([
    "qual", "quais", "que", "quem", "como", "quando", "onde", "porque", "porqu", "porque", "quantas",
    "quantos", "aposta", "apostas", "bet", "bets", "evento", "evento", "event", "selection", "selecao",
    "seleção", "na", "no", "em", "de", "do", "da", "para", "sobre", "mais", "menos", "tem", "teve",
    "ter", "foi", "ser", "esta", "está", "ontem", "hoje", "ultima", "última", "ultimo", "último", "dia",
    "dias", "semana", "horas", "hora", "pode", "dar", "muito", "muita", "melhor", "pior",
  ]);
  const meaningfulQuestionTokens = normalizedQuestion
    .split(" ")
    .filter((token) => token.length >= 4 && !stopwords.has(token));
  const hasMeaningfulOverlap = meaningfulQuestionTokens.some((token) => normalizedEntry.includes(token));
  const asksWinLikeSelection = includesAny(normalizedQuestion, ["ganhar", "a ganhar", "vencer", "vence", "win"]);

  if (normalizedQuestion === normalizedEntry) {
    score += 200;
  }

  if (!isShortGenericEntry && normalizedQuestion.includes(normalizedEntry)) {
    score += 120 + normalizedEntry.split(" ").length * 5;
  }

  if (asksWinLikeSelection && hasMeaningfulOverlap) {
    score += 100;
  }

  if (asksWinLikeSelection && !hasMeaningfulOverlap && (normalizedEntry.includes("win") || normalizedEntry.includes("ganhar"))) {
    score -= 50;
  }

  const entryTokens = normalizedEntry.split(" ").filter((token) => token.length >= 3);
  const questionTokens = normalizedQuestion.split(" ").filter((token) => token.length >= 3);

  if (!isShortGenericEntry) {
    for (const token of entryTokens) {
      if (normalizedQuestion.includes(token)) {
        score += 6;
      }
    }

    for (const token of questionTokens) {
      if (normalizedEntry.includes(token)) {
        score += 3;
      }
    }
  }

  if (questionTokens.length > 0 && entryTokens.length > 0) {
    const overlap = questionTokens.filter((token) => entryTokens.some((entryToken) => entryToken === token)).length;
    score += overlap * 8;
  }

  if (levenshteinDistance(normalizedQuestion, normalizedEntry) <= 2) {
    score += 40;
  }

  if (normalizedEntry.includes("to win")) {
    if (includesAny(normalizedQuestion, ["ganhar", "a ganhar", "vencer", "vence", "vitoria", "vitoria", "win"])) {
      score += 90;
    }
  }

  if (normalizedEntry.includes("draw")) {
    if (includesAny(normalizedQuestion, ["empate", "draw", "x"])) {
      score += 80;
    }
  }

  if (normalizedEntry.includes("over 2 5") || normalizedEntry.includes("over 2.5")) {
    if (includesAny(normalizedQuestion, ["mais de 2 5", "mais de 2.5", "over 2 5", "over 2.5", "acima de 2 5", "acima de 2.5"])) {
      score += 90;
    }
  }

  if (normalizedEntry.includes("under 2 5") || normalizedEntry.includes("under 2.5")) {
    if (includesAny(normalizedQuestion, ["menos de 2 5", "menos de 2.5", "under 2 5", "under 2.5", "abaixo de 2 5", "abaixo de 2.5"])) {
      score += 90;
    }
  }

  if (normalizedEntry.includes("yes")) {
    if (includesAny(normalizedQuestion, ["sim", "yes", "ambas marcam sim", "both teams to score sim"])) {
      score += 70;
    }
  } else if (normalizedEntry === "no") {
    if (includesAny(normalizedQuestion, ["nao", "não", "ambas marcam nao", "ambas marcam não", "both teams to score nao", "both teams to score não"])) {
      score += 70;
    } else {
      score -= 60;
    }
  }

  if (normalizedEntry.includes("+") || normalizedEntry.includes("-")) {
    const compactEntry = normalizedEntry.replace(/\s+/g, "");
    const compactQuestion = normalizedQuestion.replace(/\s+/g, "");

    if (compactQuestion.includes(compactEntry)) {
      score += 90;
    }
  }

  return score;
}

export function findBestMatch(question, entries, fieldName) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  let bestEntry = null;
  let bestScore = 0;

  for (const entry of entries) {
    const candidateScore = scoreEntryMatch(question, entry?.[fieldName]);
    if (candidateScore > bestScore) {
      bestScore = candidateScore;
      bestEntry = entry;
    }
  }

  return bestScore > 0 ? bestEntry : null;
}

function createTimeBuckets() {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    betCount: 0,
    totalStake: 0,
    totalExposure: 0,
    totalOdd: 0,
    averageOdd: 0,
  }));
}

function sortAggregateEntries(left, right) {
  if (right.betCount !== left.betCount) {
    return right.betCount - left.betCount;
  }

  if (right.totalExposure !== left.totalExposure) {
    return right.totalExposure - left.totalExposure;
  }

  return String(left.label || left.sport || left.event || left.selection || left.betType || "")
    .localeCompare(String(right.label || right.sport || right.event || right.selection || right.betType || ""));
}

function mapToSortedArray(map, keyName) {
  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      averageOdd: entry.betCount > 0 ? entry.totalOdd / entry.betCount : 0,
      selectionCount: entry.selectionSet ? entry.selectionSet.size : entry.selectionCount,
      eventCount: entry.eventSet ? entry.eventSet.size : entry.eventCount,
      sportCount: entry.sportSet ? entry.sportSet.size : entry.sportCount,
      betTypeCount: entry.betTypeSet ? entry.betTypeSet.size : entry.betTypeCount,
    }))
    .sort((left, right) => {
      if (right.betCount !== left.betCount) {
        return right.betCount - left.betCount;
      }

      if (right.totalExposure !== left.totalExposure) {
        return right.totalExposure - left.totalExposure;
      }

      return String(left[keyName]).localeCompare(String(right[keyName]));
    })
    .map((entry) => ({
      ...entry,
      selectionSet: undefined,
      eventSet: undefined,
      sportSet: undefined,
      betTypeSet: undefined,
    }));
}

export function buildBetAnalytics(bets) {
  const safeBets = Array.isArray(bets) ? bets.filter(Boolean) : [];

  const summary = {
    totalBets: safeBets.length,
    totalStake: 0,
    totalExposure: 0,
    averageOdd: 0,
    averageRiskScore: 0,
    latestBetAt: null,
    highestStakeBet: null,
    highestOddBet: null,
    highestRiskBet: null,
    highestExposureBet: null,
  };

  const sportsMap = new Map();
  const eventsMap = new Map();
  const selectionsMap = new Map();
  const betTypesMap = new Map();
  const hourBuckets = createTimeBuckets();
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
    const timestamp = bet.timestamp ? new Date(bet.timestamp) : null;
    const hour = timestamp && !Number.isNaN(timestamp.getTime()) ? timestamp.getHours() : null;

    summary.totalStake += stake;
    summary.totalExposure += exposure;
    summary.averageOdd += odd;
    summary.averageRiskScore += riskScore;

    if (timestamp && (!summary.latestBetAt || timestamp.getTime() > new Date(summary.latestBetAt).getTime())) {
      summary.latestBetAt = timestamp.toISOString();
    }

    const compactBet = {
      id: bet.id,
      sport: bet.sport || "Desconhecido",
      event: bet.event || "Evento desconhecido",
      betType: bet.betType || "BetType desconhecido",
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

    if (!summary.highestExposureBet || exposure > summary.highestExposureBet.exposure) {
      summary.highestExposureBet = compactBet;
    }

    const sportName = bet.sport || "Desconhecido";
    const eventName = bet.event || "Evento desconhecido";
    const selectionName = bet.selection || "Seleção desconhecida";
    const betTypeName = bet.betType || "BetType desconhecido";

    const sportEntry = sportsMap.get(sportName) || {
      sport: sportName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      totalOdd: 0,
      lastBetAt: null,
      eventSet: new Set(),
      selectionSet: new Set(),
      betTypeSet: new Set(),
    };

    sportEntry.betCount += 1;
    sportEntry.totalStake += stake;
    sportEntry.totalExposure += exposure;
    sportEntry.totalOdd += odd;
    sportEntry.eventSet.add(eventName);
    sportEntry.selectionSet.add(selectionName);
    sportEntry.betTypeSet.add(betTypeName);
    if (!sportEntry.lastBetAt || (timestamp && timestamp.getTime() > new Date(sportEntry.lastBetAt).getTime())) {
      sportEntry.lastBetAt = bet.timestamp;
    }
    sportsMap.set(sportName, sportEntry);

    const eventEntry = eventsMap.get(eventName) || {
      event: eventName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      totalOdd: 0,
      selectionSet: new Set(),
      betTypeSet: new Set(),
    };

    eventEntry.betCount += 1;
    eventEntry.totalStake += stake;
    eventEntry.totalExposure += exposure;
    eventEntry.totalOdd += odd;
    eventEntry.selectionSet.add(selectionName);
    eventEntry.betTypeSet.add(betTypeName);
    eventsMap.set(eventName, eventEntry);

    const selectionEntry = selectionsMap.get(selectionName) || {
      selection: selectionName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      totalOdd: 0,
      sportSet: new Set(),
      eventSet: new Set(),
      betTypeSet: new Set(),
    };

    selectionEntry.betCount += 1;
    selectionEntry.totalStake += stake;
    selectionEntry.totalExposure += exposure;
    selectionEntry.totalOdd += odd;
    selectionEntry.sportSet.add(sportName);
    selectionEntry.eventSet.add(eventName);
    selectionEntry.betTypeSet.add(betTypeName);
    selectionsMap.set(selectionName, selectionEntry);

    const betTypeEntry = betTypesMap.get(betTypeName) || {
      betType: betTypeName,
      betCount: 0,
      totalStake: 0,
      totalExposure: 0,
      totalOdd: 0,
      sportSet: new Set(),
      eventSet: new Set(),
      selectionSet: new Set(),
    };

    betTypeEntry.betCount += 1;
    betTypeEntry.totalStake += stake;
    betTypeEntry.totalExposure += exposure;
    betTypeEntry.totalOdd += odd;
    betTypeEntry.sportSet.add(sportName);
    betTypeEntry.eventSet.add(eventName);
    betTypeEntry.selectionSet.add(selectionName);
    betTypesMap.set(betTypeName, betTypeEntry);

    if (hour !== null) {
      const hourBucket = hourBuckets[hour];
      hourBucket.betCount += 1;
      hourBucket.totalStake += stake;
      hourBucket.totalExposure += exposure;
      hourBucket.totalOdd += odd;
    }

    const bucketKey = riskScore < 25 ? "low" : riskScore < 50 ? "medium" : riskScore < 75 ? "high" : "critical";
    const riskBucket = riskBuckets[bucketKey];
    riskBucket.count += 1;
    riskBucket.stake += stake;
    riskBucket.exposure += exposure;
  }

  summary.averageOdd = summary.totalBets > 0 ? summary.averageOdd / summary.totalBets : 0;
  summary.averageRiskScore = summary.totalBets > 0 ? summary.averageRiskScore / summary.totalBets : 0;

  for (const bucket of hourBuckets) {
    bucket.averageOdd = bucket.betCount > 0 ? bucket.totalOdd / bucket.betCount : 0;
  }

  const sports = mapToSortedArray(sportsMap, "sport");
  const events = mapToSortedArray(eventsMap, "event");
  const selections = mapToSortedArray(selectionsMap, "selection");
  const betTypes = mapToSortedArray(betTypesMap, "betType");

  const peakHour = [...hourBuckets].sort((left, right) => {
    if (right.betCount !== left.betCount) {
      return right.betCount - left.betCount;
    }

    if (right.totalExposure !== left.totalExposure) {
      return right.totalExposure - left.totalExposure;
    }

    return left.hour - right.hour;
  })[0] || hourBuckets[0];

  const recentBets = [...safeBets]
    .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
    .slice(0, 5)
    .map((bet) => ({
      id: bet.id,
      sport: bet.sport || "Desconhecido",
      event: bet.event || "Evento desconhecido",
      betType: bet.betType || "BetType desconhecido",
      selection: bet.selection || "Seleção desconhecida",
      stake: Number(bet.stake) || 0,
      odd: Number(bet.odd) || 0,
      timestamp: bet.timestamp,
      riskScore: Number(bet.riskScore ?? bet.exposureRisk) || 0,
      potentialProfit: Number(bet.potentialProfit ?? bet.exposureRisk) || 0,
    }));

  return {
    summary,
    allBets: safeBets,
    sports,
    allSports: sports,
    events,
    allEvents: events,
    selections,
    allSelections: selections,
    betTypes,
    allBetTypes: betTypes,
    hourBuckets,
    peakHour,
    riskBuckets,
    recentBets,
  };
}

export { includesAny, normalizeText, sortAggregateEntries };