/**
 * Toolkit de analytics determinístico para o Risk Assistant.
 *
 * Filosofia: cada "tool" é uma função pura que recebe (bets, params) e
 * devolve { data, answer }. O LLM nunca calcula números — escolhe qual
 * tool chamar e com que parâmetros; depois recebe os dados estruturados
 * e formula a resposta em linguagem natural.
 *
 * Toda a análise corre client-side a partir do array de apostas já
 * acumulado no frontend (betsStore + WebSocket).
 */

// ─── Formatadores ──────────────────────────────────────────────────────────

const EUR_FORMATTER = new Intl.NumberFormat("pt-PT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatCurrency(value) {
  return EUR_FORMATTER.format(Number(value) || 0);
}

export function formatDateTime(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "data inválida";
  return DATE_TIME_FORMATTER.format(date);
}

function formatHourRange(hour) {
  const start = String(hour).padStart(2, "0");
  const end = String((hour + 1) % 24).padStart(2, "0");
  return `${start}h–${end}h`;
}

function formatPercent(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return "0%";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

// ─── Janelas temporais ─────────────────────────────────────────────────────

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Devolve { from, to, label } para o período pedido.
 * Aceita: "today" | "yesterday" | "1h" | "24h" | "7d" | "14d" | "all".
 */
export function resolvePeriod(period = "24h") {
  const now = new Date();

  if (period === "today") {
    return { from: startOfDay(now), to: endOfDay(now), label: "hoje" };
  }

  if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y), label: "ontem" };
  }

  if (period === "1h") {
    return { from: new Date(now.getTime() - 60 * 60 * 1000), to: now, label: "última hora" };
  }

  if (period === "7d") {
    return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: now, label: "últimos 7 dias" };
  }

  if (period === "14d") {
    return { from: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000), to: now, label: "últimos 14 dias" };
  }

  if (period === "all") {
    return { from: new Date(0), to: now, label: "todo o histórico" };
  }

  // default 24h
  return { from: new Date(now.getTime() - 24 * 60 * 60 * 1000), to: now, label: "últimas 24h" };
}

function withinWindow(timestamp, from, to) {
  const t = new Date(timestamp).getTime();
  if (!Number.isFinite(t)) return false;
  return t >= from.getTime() && t <= to.getTime();
}

export function filterByPeriod(bets, period) {
  const { from, to, label } = resolvePeriod(period);
  const filtered = (Array.isArray(bets) ? bets : []).filter((b) => withinWindow(b?.timestamp, from, to));
  return { bets: filtered, from, to, label };
}

// ─── Utilitários de texto / matching ───────────────────────────────────────

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

function levenshtein(a, b) {
  if (!a) return b.length;
  if (!b) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

export function fuzzyMatch(query, items, field) {
  if (!query) return null;
  const q = normalizeText(query);
  if (!q) return null;
  const qTokens = q.split(" ").filter(Boolean);

  let best = null;
  let bestScore = Infinity;

  for (const item of items) {
    const value = normalizeText(item?.[field] ?? "");
    if (!value) continue;

    if (value.includes(q) || q.includes(value)) {
      return item;
    }

    const valueTokens = value.split(" ").filter(Boolean);
    let tokenScore = 0;
    let matchedTokens = 0;

    for (const qt of qTokens) {
      if (qt.length < 3) continue;
      let bestForToken = Infinity;
      for (const vt of valueTokens) {
        if (Math.abs(vt.length - qt.length) > 3) continue;
        const d = levenshtein(qt, vt);
        if (d < bestForToken) bestForToken = d;
      }
      if (bestForToken <= 2) {
        matchedTokens += 1;
        tokenScore += bestForToken;
      }
    }

    if (matchedTokens > 0) {
      const score = tokenScore / matchedTokens - matchedTokens;
      if (score < bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }

  return best;
}

// ─── Agregações base reutilizáveis ─────────────────────────────────────────

function emptyAgg(key, keyField) {
  return {
    [keyField]: key,
    betCount: 0,
    totalStake: 0,
    totalPayout: 0,
    totalExposure: 0,
    odds: [],
  };
}

function aggregateBy(bets, keyField) {
  const map = new Map();
  for (const bet of bets) {
    const key = bet?.[keyField] || `(${keyField} desconhecido)`;
    const agg = map.get(key) || emptyAgg(key, keyField);
    agg.betCount += 1;
    agg.totalStake += Number(bet.stake) || 0;
    agg.totalPayout += Number(bet.potentialPayout) || 0;
    agg.totalExposure += Number(bet.potentialProfit) || 0;
    agg.odds.push(Number(bet.odd) || 0);
    map.set(key, agg);
  }
  return Array.from(map.values());
}

// ═══════════════════════════════════════════════════════════════════════════
//                            FERRAMENTAS / TOOLS
// ═══════════════════════════════════════════════════════════════════════════

// 1) Selection com mais apostas num período (default: ontem) ─────────────────
export function topSelection(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "yesterday");
  if (scoped.length === 0) {
    return { data: null, answer: `Não há apostas no período ${label} para determinar a selection mais apostada.` };
  }

  const aggs = aggregateBy(scoped, "selection").sort((a, b) => b.betCount - a.betCount);
  const top = aggs[0];
  return {
    data: { selection: top.selection, betCount: top.betCount, period: label },
    answer: `A selection com mais apostas ${label} foi "${top.selection}", com ${top.betCount} apostas.`,
  };
}

// 2) Odd mais usada (modo estatístico) para uma selection ───────────────────
export function selectionOddMode(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (!params.selection) {
    return { data: null, answer: "Indica qual é a selection (ex.: 'odd mais usada nas apostas da selection Draw')." };
  }

  const match = fuzzyMatch(params.selection, scoped, "selection");
  if (!match) {
    return { data: null, answer: `Não encontrei apostas na selection "${params.selection}" ${label}.` };
  }

  const selectionName = match.selection;
  const oddCounts = new Map();
  let total = 0;

  for (const b of scoped) {
    if (b.selection !== selectionName) continue;
    const odd = Number(b.odd).toFixed(2);
    oddCounts.set(odd, (oddCounts.get(odd) || 0) + 1);
    total += 1;
  }

  if (total === 0) {
    return { data: null, answer: `Sem apostas na selection "${selectionName}" ${label}.` };
  }

  const sorted = [...oddCounts.entries()].sort((a, b) => b[1] - a[1]);
  const [topOdd, topCount] = sorted[0];

  return {
    data: { selection: selectionName, odd: Number(topOdd), count: topCount, totalBets: total, period: label },
    answer: `A odd mais usada nas apostas da selection "${selectionName}" foi ${topOdd} (${topCount} de ${total} apostas, ${label}).`,
  };
}

// 3) Número de selections distintas num evento ──────────────────────────────
export function eventSelectionCount(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "all");
  if (!params.event) {
    return { data: null, answer: "Indica qual é o evento (ex.: 'Quantas selections tem o evento Benfica vs Porto')." };
  }

  const match = fuzzyMatch(params.event, scoped, "event");
  if (!match) {
    return { data: null, answer: `Não encontrei apostas para o evento "${params.event}" ${label}.` };
  }

  const eventName = match.event;
  const selections = new Set();
  for (const b of scoped) {
    if (b.event === eventName) selections.add(b.selection);
  }

  return {
    data: { event: eventName, selectionCount: selections.size, selections: [...selections], period: label },
    answer: `O evento "${eventName}" tem ${selections.size} selections distintas apostadas (${label}).`,
  };
}

// 4) Média de odd para apostas numa selection ───────────────────────────────
export function selectionAverageOdd(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (!params.selection) {
    return { data: null, answer: "Indica qual é a selection (ex.: 'média de odd para apostas na selection Draw')." };
  }

  const match = fuzzyMatch(params.selection, scoped, "selection");
  if (!match) {
    return { data: null, answer: `Não encontrei apostas na selection "${params.selection}" ${label}.` };
  }

  const selectionName = match.selection;
  let sum = 0;
  let count = 0;
  for (const b of scoped) {
    if (b.selection === selectionName) {
      sum += Number(b.odd) || 0;
      count += 1;
    }
  }

  if (count === 0) {
    return { data: null, answer: `Sem apostas na selection "${selectionName}" ${label}.` };
  }

  const avg = sum / count;
  return {
    data: { selection: selectionName, averageOdd: avg, betCount: count, period: label },
    answer: `A odd média das ${count} apostas na selection "${selectionName}" é ${avg.toFixed(2)} (${label}).`,
  };
}

// 5) Bet com maior prejuízo potencial para a casa ───────────────────────────
export function topLossBet(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas no período ${label}.` };
  }

  let worst = null;
  for (const b of scoped) {
    const loss = Number(b.potentialProfit) || 0;
    if (!worst || loss > Number(worst.potentialProfit)) worst = b;
  }

  if (!worst) {
    return { data: null, answer: `Sem dados de prejuízo potencial ${label}.` };
  }

  return {
    data: {
      id: worst.id,
      sport: worst.sport,
      event: worst.event,
      betType: worst.betType,
      selection: worst.selection,
      odd: worst.odd,
      stake: worst.stake,
      potentialLoss: worst.potentialProfit,
      timestamp: worst.timestamp,
      period: label,
    },
    answer: `A aposta com maior prejuízo potencial para a casa (${label}) é #${worst.id}: ${worst.sport} — ${worst.event} (${worst.betType}, "${worst.selection}"), stake ${formatCurrency(worst.stake)} a odd ${Number(worst.odd).toFixed(2)} → exposição de ${formatCurrency(worst.potentialProfit)}.`,
  };
}

// 6) Distribuição de bets por betType num período (default: hoje) ───────────
export function betTypeDistribution(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "today");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas no período ${label}.` };
  }

  const aggs = aggregateBy(scoped, "betType")
    .map((a) => ({
      betType: a.betType,
      betCount: a.betCount,
      percentage: (a.betCount / scoped.length) * 100,
      totalStake: a.totalStake,
    }))
    .sort((a, b) => b.betCount - a.betCount);

  const total = scoped.length;
  const top = aggs.slice(0, 6);
  const summary = top
    .map((a) => `${a.betType}: ${a.betCount} (${a.percentage.toFixed(1)}%)`)
    .join(", ");

  return {
    data: { period: label, total, distribution: aggs },
    answer: `Distribuição por betType (${label}, ${total} apostas): ${summary}.`,
  };
}

// 7) Bet com mais legs ──────────────────────────────────────────────────────
export function maxLegs(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "all");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas no período ${label}.` };
  }

  let maxBet = null;
  let maxCount = 1;
  for (const b of scoped) {
    const legs = Array.isArray(b.legs) ? b.legs.length : 1;
    if (legs > maxCount) {
      maxCount = legs;
      maxBet = b;
    }
  }

  if (!maxBet) {
    return {
      data: { legs: 1, isSingleLegDataset: true, period: label },
      answer: `Neste sistema todas as apostas são single-leg (1 leg por bet), ou seja, todas têm exatamente 1 leg.`,
    };
  }

  return {
    data: { id: maxBet.id, legs: maxCount, period: label },
    answer: `A aposta com mais legs é a #${maxBet.id} com ${maxCount} legs.`,
  };
}

// 8) betType mais comum para apostas num sport ──────────────────────────────
export function topBetTypeForSport(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (!params.sport) {
    return { data: null, answer: "Indica o desporto (ex.: 'betType mais comum no Football')." };
  }

  const allSports = [...new Set(scoped.map((b) => b.sport))].map((s) => ({ sport: s }));
  const match = fuzzyMatch(params.sport, allSports, "sport");
  if (!match) {
    return { data: null, answer: `Não encontrei apostas para o desporto "${params.sport}" ${label}.` };
  }

  const sportName = match.sport;
  const filtered = scoped.filter((b) => b.sport === sportName);
  if (filtered.length === 0) {
    return { data: null, answer: `Sem apostas em ${sportName} ${label}.` };
  }

  const aggs = aggregateBy(filtered, "betType").sort((a, b) => b.betCount - a.betCount);
  const top = aggs[0];
  return {
    data: { sport: sportName, betType: top.betType, betCount: top.betCount, totalInSport: filtered.length, period: label },
    answer: `Em ${sportName}, o betType mais comum é "${top.betType}" com ${top.betCount} de ${filtered.length} apostas (${label}).`,
  };
}

// 9) Hora do dia com mais apostas (default: ontem) ──────────────────────────
export function peakHour(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "yesterday");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }

  const buckets = new Array(24).fill(0);
  for (const b of scoped) {
    const d = new Date(b.timestamp);
    if (!Number.isNaN(d.getTime())) {
      buckets[d.getHours()] += 1;
    }
  }

  let peakIdx = 0;
  for (let i = 1; i < 24; i += 1) {
    if (buckets[i] > buckets[peakIdx]) peakIdx = i;
  }

  return {
    data: { hour: peakIdx, range: formatHourRange(peakIdx), count: buckets[peakIdx], buckets, period: label },
    answer: `${capitalize(label)} o pico de apostas foi entre as ${formatHourRange(peakIdx)} com ${buckets[peakIdx]} apostas.`,
  };
}

// 10) Hora do dia com mais apostas num sport (default: última semana) ───────
export function peakHourForSport(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "7d");
  if (!params.sport) {
    return { data: null, answer: "Indica o desporto (ex.: 'hora do dia com mais apostas no Tennis')." };
  }

  const allSports = [...new Set(scoped.map((b) => b.sport))].map((s) => ({ sport: s }));
  const match = fuzzyMatch(params.sport, allSports, "sport");
  if (!match) {
    return { data: null, answer: `Não encontrei apostas para o desporto "${params.sport}" ${label}.` };
  }

  const sportName = match.sport;
  const filtered = scoped.filter((b) => b.sport === sportName);
  if (filtered.length === 0) {
    return { data: null, answer: `Sem apostas em ${sportName} ${label}.` };
  }

  const buckets = new Array(24).fill(0);
  for (const b of filtered) {
    const d = new Date(b.timestamp);
    if (!Number.isNaN(d.getTime())) buckets[d.getHours()] += 1;
  }

  let peakIdx = 0;
  for (let i = 1; i < 24; i += 1) {
    if (buckets[i] > buckets[peakIdx]) peakIdx = i;
  }

  return {
    data: { sport: sportName, hour: peakIdx, range: formatHourRange(peakIdx), count: buckets[peakIdx], buckets, period: label },
    answer: `Em ${sportName} (${label}), o pico de apostas é entre as ${formatHourRange(peakIdx)} com ${buckets[peakIdx]} apostas.`,
  };
}

// ─── Tools extra ───────────────────────────────────────────────────────────

export function summary(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: { period: label, totalBets: 0 }, answer: `Sem apostas ${label}.` };
  }

  let totalStake = 0;
  let totalExposure = 0;
  let totalOdd = 0;
  for (const b of scoped) {
    totalStake += Number(b.stake) || 0;
    totalExposure += Number(b.potentialProfit) || 0;
    totalOdd += Number(b.odd) || 0;
  }
  const avgOdd = totalOdd / scoped.length;

  return {
    data: {
      period: label,
      totalBets: scoped.length,
      totalStake,
      totalExposure,
      averageOdd: avgOdd,
    },
    answer: `${capitalize(label)}: ${scoped.length} apostas, stake total ${formatCurrency(totalStake)}, exposição ${formatCurrency(totalExposure)}, odd média ${avgOdd.toFixed(2)}.`,
  };
}

export function bySport(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }

  const aggs = aggregateBy(scoped, "sport")
    .map((a) => ({ sport: a.sport, betCount: a.betCount, totalStake: a.totalStake, totalExposure: a.totalExposure }))
    .sort((a, b) => b.betCount - a.betCount);

  const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 20);
  const top = aggs.slice(0, limit);
  const summaryText = top
    .map((a) => `${a.sport}: ${a.betCount} apostas (${formatCurrency(a.totalExposure)} exposição)`)
    .join("; ");

  return { data: { period: label, sports: aggs }, answer: `Top desportos ${label} — ${summaryText}.` };
}

export function recentBets(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }

  const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 20);
  const sorted = [...scoped]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  const lines = sorted.map(
    (b) => `#${b.id} ${formatDateTime(b.timestamp)} — ${b.sport} / ${b.event} / ${b.selection} — stake ${formatCurrency(b.stake)} @ ${Number(b.odd).toFixed(2)}`,
  );

  return {
    data: { period: label, bets: sorted },
    answer: `Últimas ${sorted.length} apostas (${label}):\n${lines.join("\n")}`,
  };
}

export function topStakeBet(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }

  let top = scoped[0];
  for (const b of scoped) {
    if ((Number(b.stake) || 0) > (Number(top.stake) || 0)) top = b;
  }

  return {
    data: { bet: top, period: label },
    answer: `Maior stake (${label}): #${top.id} — ${top.sport} / ${top.event} / ${top.selection} — ${formatCurrency(top.stake)} @ odd ${Number(top.odd).toFixed(2)}.`,
  };
}

export function topBetType(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }
  const aggs = aggregateBy(scoped, "betType").sort((a, b) => b.betCount - a.betCount);
  const top = aggs[0];
  return {
    data: { betType: top.betType, betCount: top.betCount, period: label },
    answer: `O betType mais comum ${label} é "${top.betType}" com ${top.betCount} apostas.`,
  };
}

export function byRisk(bets, params = {}) {
  const { bets: scoped, label } = filterByPeriod(bets, params.period || "24h");
  if (scoped.length === 0) {
    return { data: null, answer: `Sem apostas ${label}.` };
  }

  const buckets = {
    low: { label: "Baixo", count: 0 },
    medium: { label: "Médio", count: 0 },
    high: { label: "Alto", count: 0 },
    critical: { label: "Crítico", count: 0 },
  };

  for (const b of scoped) {
    const r = Number(b.riskScore) || 0;
    if (r < 25) buckets.low.count += 1;
    else if (r < 50) buckets.medium.count += 1;
    else if (r < 75) buckets.high.count += 1;
    else buckets.critical.count += 1;
  }

  return {
    data: { period: label, buckets },
    answer: `Distribuição de risco (${label}) — Baixo: ${buckets.low.count}, Médio: ${buckets.medium.count}, Alto: ${buckets.high.count}, Crítico: ${buckets.critical.count}.`,
  };
}

// ─── NEW: comparePeriods ──────────────────────────────────────────────────
// Compara duas janelas temporais nas métricas principais (volume, stake, exposição, odd média).
// Aceita: periodA, periodB (default: today vs yesterday). metric opcional restringe o output.

function aggregateMetrics(bets) {
  let totalStake = 0;
  let totalExposure = 0;
  let totalOdd = 0;
  for (const b of bets) {
    totalStake += Number(b.stake) || 0;
    totalExposure += Number(b.potentialProfit) || 0;
    totalOdd += Number(b.odd) || 0;
  }
  return {
    betCount: bets.length,
    totalStake,
    totalExposure,
    averageOdd: bets.length > 0 ? totalOdd / bets.length : 0,
  };
}

function deltaPct(a, b) {
  if (b === 0) return a === 0 ? 0 : 100;
  return ((a - b) / Math.abs(b)) * 100;
}

export function comparePeriods(bets, params = {}) {
  const periodA = params.periodA || "today";
  const periodB = params.periodB || "yesterday";
  const { bets: betsA, label: labelA } = filterByPeriod(bets, periodA);
  const { bets: betsB, label: labelB } = filterByPeriod(bets, periodB);

  if (betsA.length === 0 && betsB.length === 0) {
    return { data: null, answer: `Sem apostas em ${labelA} nem em ${labelB} para comparar.` };
  }

  const a = aggregateMetrics(betsA);
  const b = aggregateMetrics(betsB);

  const deltas = {
    betCount: deltaPct(a.betCount, b.betCount),
    totalStake: deltaPct(a.totalStake, b.totalStake),
    totalExposure: deltaPct(a.totalExposure, b.totalExposure),
    averageOdd: deltaPct(a.averageOdd, b.averageOdd),
  };

  const metric = params.metric;
  if (metric && deltas[metric] !== undefined) {
    const labels = {
      betCount: "volume de apostas",
      totalStake: "stake total",
      totalExposure: "exposição",
      averageOdd: "odd média",
    };
    return {
      data: { periodA: labelA, periodB: labelB, a, b, deltas },
      answer: `${capitalize(labels[metric])}: ${labelA} = ${formatMetric(metric, a[metric])} vs ${labelB} = ${formatMetric(metric, b[metric])} (${formatPercent(deltas[metric])}).`,
    };
  }

  const lines = [
    `Volume: ${a.betCount} vs ${b.betCount} (${formatPercent(deltas.betCount)})`,
    `Stake: ${formatCurrency(a.totalStake)} vs ${formatCurrency(b.totalStake)} (${formatPercent(deltas.totalStake)})`,
    `Exposição: ${formatCurrency(a.totalExposure)} vs ${formatCurrency(b.totalExposure)} (${formatPercent(deltas.totalExposure)})`,
    `Odd média: ${a.averageOdd.toFixed(2)} vs ${b.averageOdd.toFixed(2)} (${formatPercent(deltas.averageOdd)})`,
  ];

  return {
    data: { periodA: labelA, periodB: labelB, a, b, deltas },
    answer: `${capitalize(labelA)} vs ${labelB}:\n${lines.join("\n")}`,
  };
}

function formatMetric(metric, value) {
  if (metric === "betCount") return String(value);
  if (metric === "totalStake" || metric === "totalExposure") return formatCurrency(value);
  if (metric === "averageOdd") return Number(value).toFixed(2);
  return String(value);
}

// ─── NEW: detectAnomalies ────────────────────────────────────────────────
// Heurísticas para detetar padrões dignos de atenção pela operação.
// Cada anomalia tem: kind, severity (low|medium|high), title, detail, evidence.

const ANOMALY_THRESHOLDS = {
  // Stake médio numa selection subiu ao menos 3x na última hora vs baseline 7d
  stakeSurgeMultiplier: 3,
  // Concentração de bets numa selection num evento (>=80% do volume do evento)
  selectionConcentrationPct: 80,
  // Aposta única cuja exposição é >=20% do total do dia
  singleExposureSharePct: 20,
  // Pico de volume na última hora: >=200% da média horária das últimas 24h
  volumeSpikePct: 200,
  // Mínimo de bets para considerar concentração (evita falsos positivos)
  concentrationMinVolume: 10,
};

export function detectAnomalies(bets, params = {}) {
  const safe = Array.isArray(bets) ? bets : [];
  if (safe.length === 0) {
    return { data: { anomalies: [] }, answer: "Sem dados suficientes para detetar anomalias." };
  }

  const anomalies = [];
  const now = Date.now();

  // ── Janelas ───────────────────────────────────────────────────────────
  const lastHour = safe.filter((b) => now - new Date(b.timestamp).getTime() <= 60 * 60 * 1000);
  const last24h = safe.filter((b) => now - new Date(b.timestamp).getTime() <= 24 * 60 * 60 * 1000);
  const last7d = safe.filter((b) => now - new Date(b.timestamp).getTime() <= 7 * 24 * 60 * 60 * 1000);
  const today = safe.filter((b) => withinWindow(b.timestamp, startOfDay(new Date()), endOfDay(new Date())));

  // ── 1) Pico de volume na última hora vs média horária últimas 24h ─────
  if (last24h.length >= 24 && lastHour.length >= 5) {
    const hourlyAvg = last24h.length / 24;
    const ratio = (lastHour.length / hourlyAvg) * 100;
    if (ratio >= ANOMALY_THRESHOLDS.volumeSpikePct) {
      anomalies.push({
        kind: "volume-spike",
        severity: ratio >= 400 ? "high" : "medium",
        title: "Pico de volume na última hora",
        detail: `${lastHour.length} apostas na última hora vs média horária de ${hourlyAvg.toFixed(1)} (${ratio.toFixed(0)}% do normal).`,
        evidence: { lastHourCount: lastHour.length, hourlyAvg24h: hourlyAvg, ratioPct: ratio },
      });
    }
  }

  // ── 2) Stake médio numa selection na última hora vs baseline 7d ────────
  if (lastHour.length >= 5 && last7d.length >= 50) {
    const selectionsLastHour = aggregateBy(lastHour, "selection");
    const selections7d = aggregateBy(last7d, "selection");
    const baselineMap = new Map(selections7d.map((s) => [s.selection, s.totalStake / s.betCount]));

    for (const s of selectionsLastHour) {
      if (s.betCount < 3) continue;
      const baseline = baselineMap.get(s.selection);
      if (!baseline || baseline === 0) continue;
      const currentAvg = s.totalStake / s.betCount;
      const multiplier = currentAvg / baseline;
      if (multiplier >= ANOMALY_THRESHOLDS.stakeSurgeMultiplier) {
        anomalies.push({
          kind: "stake-surge",
          severity: multiplier >= 5 ? "high" : "medium",
          title: `Stake médio anormal na selection "${s.selection}"`,
          detail: `${s.betCount} apostas na última hora com stake médio ${formatCurrency(currentAvg)}, ${multiplier.toFixed(1)}× acima do baseline de 7 dias (${formatCurrency(baseline)}).`,
          evidence: { selection: s.selection, currentAvg, baseline, multiplier, betCount: s.betCount },
        });
      }
    }
  }

  // ── 3) Concentração de bets numa selection dentro de um evento ────────
  if (last24h.length >= ANOMALY_THRESHOLDS.concentrationMinVolume) {
    const eventMap = new Map();
    for (const b of last24h) {
      const key = b.event;
      if (!eventMap.has(key)) eventMap.set(key, { total: 0, selections: new Map() });
      const entry = eventMap.get(key);
      entry.total += 1;
      entry.selections.set(b.selection, (entry.selections.get(b.selection) || 0) + 1);
    }

    for (const [event, info] of eventMap.entries()) {
      if (info.total < ANOMALY_THRESHOLDS.concentrationMinVolume) continue;
      let topSel = null;
      let topCount = 0;
      for (const [sel, count] of info.selections.entries()) {
        if (count > topCount) {
          topCount = count;
          topSel = sel;
        }
      }
      const pct = (topCount / info.total) * 100;
      if (pct >= ANOMALY_THRESHOLDS.selectionConcentrationPct) {
        anomalies.push({
          kind: "selection-concentration",
          severity: pct >= 95 ? "high" : "medium",
          title: `Concentração em "${topSel}" no evento "${event}"`,
          detail: `${topCount} de ${info.total} apostas (${pct.toFixed(0)}%) nas últimas 24h foram na mesma selection.`,
          evidence: { event, selection: topSel, share: pct, eventVolume: info.total },
        });
      }
    }
  }

  // ── 4) Aposta única cuja exposição é >=N% do total do dia ─────────────
  if (today.length > 0) {
    const totalExposureToday = today.reduce((acc, b) => acc + (Number(b.potentialProfit) || 0), 0);
    if (totalExposureToday > 0) {
      for (const b of today) {
        const exp = Number(b.potentialProfit) || 0;
        const share = (exp / totalExposureToday) * 100;
        if (share >= ANOMALY_THRESHOLDS.singleExposureSharePct) {
          anomalies.push({
            kind: "single-exposure",
            severity: share >= 40 ? "high" : "medium",
            title: `Aposta #${b.id} concentra ${share.toFixed(0)}% da exposição de hoje`,
            detail: `${b.sport} — ${b.event} (${b.betType}, "${b.selection}"), stake ${formatCurrency(b.stake)} @ ${Number(b.odd).toFixed(2)} → exposição ${formatCurrency(exp)} de ${formatCurrency(totalExposureToday)} totais hoje.`,
            evidence: { id: b.id, exposure: exp, share, totalExposureToday },
          });
        }
      }
    }
  }

  // ── Ordenar por severidade ────────────────────────────────────────────
  const severityRank = { high: 0, medium: 1, low: 2 };
  anomalies.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  if (anomalies.length === 0) {
    return {
      data: { anomalies: [], checkedAt: new Date().toISOString() },
      answer: "Sem padrões anómalos detetados. Volume, concentração e exposição dentro do normal.",
    };
  }

  const summaryLine = `${anomalies.length} ${anomalies.length === 1 ? "alerta" : "alertas"} detetado${anomalies.length === 1 ? "" : "s"}:`;
  const bullets = anomalies.map((a) => `• [${a.severity.toUpperCase()}] ${a.title} — ${a.detail}`).join("\n");

  return {
    data: { anomalies, checkedAt: new Date().toISOString() },
    answer: `${summaryLine}\n${bullets}`,
  };
}

// ─── Catálogo de tools (consumido pelo LLM) ────────────────────────────────

export const TOOL_CATALOG = {
  "top-selection": {
    fn: topSelection,
    description: "Selection com mais apostas num período. Default: ontem.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "selection-odd-mode": {
    fn: selectionOddMode,
    description: "Odd mais usada (moda) nas apostas de uma selection específica.",
    params: { period: "today|yesterday|1h|24h|7d|all", selection: "string (obrigatório)" },
  },
  "event-selection-count": {
    fn: eventSelectionCount,
    description: "Número de selections distintas que um evento tem.",
    params: { period: "today|yesterday|1h|24h|7d|all (default all)", event: "string (obrigatório)" },
  },
  "selection-average-odd": {
    fn: selectionAverageOdd,
    description: "Odd média de todas as apostas numa selection.",
    params: { period: "today|yesterday|1h|24h|7d|all", selection: "string (obrigatório)" },
  },
  "top-loss-bet": {
    fn: topLossBet,
    description: "Aposta com maior prejuízo potencial para a casa.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "bettype-distribution": {
    fn: betTypeDistribution,
    description: "Distribuição de apostas por betType. Default: hoje.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "max-legs": {
    fn: maxLegs,
    description: "Aposta com mais legs. Dataset atual é single-leg.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "top-bettype-sport": {
    fn: topBetTypeForSport,
    description: "betType mais comum nas apostas de um desporto.",
    params: { period: "today|yesterday|1h|24h|7d|all", sport: "string (obrigatório)" },
  },
  "peak-hour": {
    fn: peakHour,
    description: "Hora do dia com mais apostas. Default: ontem.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "peak-hour-sport": {
    fn: peakHourForSport,
    description: "Hora do dia com mais apostas num desporto. Default: 7d.",
    params: { period: "today|yesterday|1h|24h|7d|all", sport: "string (obrigatório)" },
  },
  summary: {
    fn: summary,
    description: "Resumo geral (total bets, stake, exposição, odd média) do período.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "by-sport": {
    fn: bySport,
    description: "Ranking de desportos por número de apostas.",
    params: { period: "today|yesterday|1h|24h|7d|all", limit: "number" },
  },
  recent: {
    fn: recentBets,
    description: "Últimas apostas do período.",
    params: { period: "today|yesterday|1h|24h|7d|all", limit: "number" },
  },
  "top-stake": {
    fn: topStakeBet,
    description: "Aposta com maior stake.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "bettype-top": {
    fn: topBetType,
    description: "betType mais comum no geral.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "by-risk": {
    fn: byRisk,
    description: "Distribuição de apostas por nível de risco.",
    params: { period: "today|yesterday|1h|24h|7d|all" },
  },
  "compare-periods": {
    fn: comparePeriods,
    description: "Compara duas janelas temporais (volume, stake, exposição, odd média) com variação %. Default: today vs yesterday.",
    params: {
      periodA: "today|yesterday|1h|24h|7d|all (default today)",
      periodB: "today|yesterday|1h|24h|7d|all (default yesterday)",
      metric: "betCount|totalStake|totalExposure|averageOdd (opcional)",
    },
  },
  "detect-anomalies": {
    fn: detectAnomalies,
    description: "Deteta padrões anómalos: picos de volume, surges de stake, concentração suspeita, exposições concentradas.",
    params: {},
  },
};

/**
 * Executa uma tool pelo nome.
 */
export function runTool(toolName, bets, params = {}) {
  const entry = TOOL_CATALOG[toolName];
  if (!entry) {
    return { tool: toolName, data: null, answer: "", error: `Tool desconhecida: ${toolName}` };
  }

  try {
    const result = entry.fn(bets, params);
    return { tool: toolName, params, data: result.data, answer: result.answer };
  } catch (error) {
    return { tool: toolName, params, data: null, answer: "", error: error.message };
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function capitalize(text = "") {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function describeDataset(bets) {
  const safe = Array.isArray(bets) ? bets : [];
  if (safe.length === 0) {
    return { totalBets: 0, sports: [], betTypes: [], topEvents: [], topSelections: [], oldest: null, newest: null };
  }

  const sports = [...new Set(safe.map((b) => b.sport).filter(Boolean))];
  const betTypes = [...new Set(safe.map((b) => b.betType).filter(Boolean))];

  const eventCounts = new Map();
  const selectionCounts = new Map();
  let oldest = safe[0].timestamp;
  let newest = safe[0].timestamp;

  for (const b of safe) {
    if (b.event) eventCounts.set(b.event, (eventCounts.get(b.event) || 0) + 1);
    if (b.selection) selectionCounts.set(b.selection, (selectionCounts.get(b.selection) || 0) + 1);
    if (new Date(b.timestamp).getTime() < new Date(oldest).getTime()) oldest = b.timestamp;
    if (new Date(b.timestamp).getTime() > new Date(newest).getTime()) newest = b.timestamp;
  }

  const topEvents = [...eventCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([event, count]) => ({ event, count }));
  const topSelections = [...selectionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([selection, count]) => ({ selection, count }));

  return {
    totalBets: safe.length,
    sports,
    betTypes,
    topEvents,
    topSelections,
    oldest,
    newest,
  };
}