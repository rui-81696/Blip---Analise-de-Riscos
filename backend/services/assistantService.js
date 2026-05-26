import { getDetailedAnalytics } from "./statsService.js";
import { buildBetAnalytics, findBestMatch, normalizeText } from "./betAnalytics.js";

function containsAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function normalizeRequestedIntent(intent) {
  const safeIntent = String(intent || "").trim();

  if (safeIntent === "critical") {
    return "by-risk";
  }

  return safeIntent;
}

function normalizeCompact(value = "") {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function extractSelectionCandidates(question) {
  const normalized = normalizeCompact(question);
  const candidates = new Set();

  const patterns = [
    /(?:selection|selecao|seleção|aposta|bet|jogo|jogo do|na|no|para a|para o|em a|em o)\s+(.+?)$/i,
    /(?:para|na|no|em|sobre)\s+(.+?)\s*(?:\?|$)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) {
      candidates.add(match[1].trim());
    }
  }

  return [...candidates];
}

function detectQuestionShape(question) {
  const normalized = normalizeCompact(question);

  if (containsAny(normalized, ["maior numero de apostas", "maior número de apostas", "mais apostas durante o dia", "pico de apostas", "hora com mais apostas"])) {
    return containsAny(normalized, ["sport", "desporto"]) ? "peak-hour-sport" : "peak-hour";
  }

  if (containsAny(normalized, ["quantas apostas", "quantos apostas", "numero de apostas", "número de apostas", "quantas bets", "quantos bets"])) {
    return "count-bets";
  }

  if (containsAny(normalized, ["quantas selections", "numero de selections", "número de selections"])) {
    return "event-selection-count";
  }

  if (containsAny(normalized, ["odd mais usada", "odd mais frequente", "odd mais repetida"])) {
    return "selection-odd-mode";
  }

  if (containsAny(normalized, ["media de odd", "odd media"])) {
    return "selection-average-odd";
  }

  if (containsAny(normalized, ["mais apostas", "mais apostada", "teve mais apostas"])) {
    return "selection-top";
  }

  if (containsAny(normalized, ["prejuizo", "perda max", "maior perda", "pode dar prejuizo"])) {
    return "top-loss-bet";
  }

  if (containsAny(normalized, ["maior exposicao potencial", "maior exposição potencial", "maior exposicao", "maior exposição"])) {
    return "top-loss-bet";
  }

  if (containsAny(normalized, ["bettype mais comum", "tipo de aposta mais comum", "bet type mais comum"])) {
    return "bettype-top";
  }

  if (containsAny(normalized, ["top desportos", "top sports", "desportos mais", "sports mais"])) {
    return "top-sports";
  }

  if (containsAny(normalized, ["distribuicao de bets por bettype", "distribuição de bets por bettype", "por bettype"])) {
    return "bettype-distribution";
  }

  if (containsAny(normalized, ["distribuicao mercados", "distribuição mercados", "mercados", "mercado"]) && containsAny(normalized, ["distribuicao", "distribuição", "lista", "mostrar"])) {
    return "bettype-distribution";
  }

  if (containsAny(normalized, ["altura do dia", "hora do dia", "pico de apostas"])) {
    return containsAny(normalized, ["sport", "desporto"]) ? "peak-hour-sport" : "peak-hour";
  }

  if (containsAny(normalized, ["evento", "sobre o evento", "diz me tudo", "fala me do evento", "tudo sobre"])) {
    return "event-summary";
  }

  return "unknown";
}

function resolveSelectionTarget(question, analytics) {
  const candidates = extractSelectionCandidates(question);
  const matchedSelection = findBestMatch(question, analytics.selections, "selection");

  if (matchedSelection) {
    return matchedSelection;
  }

  for (const candidate of candidates) {
    const candidateMatch = findBestMatch(candidate, analytics.selections, "selection");
    if (candidateMatch) {
      return candidateMatch;
    }
  }

  return null;
}

function resolveMarketTarget(question, analytics) {
  return findBestMatch(question, analytics.betTypes, "betType");
}

function resolveSportTarget(question, analytics) {
  return findBestMatch(question, analytics.sports, "sport");
}

function resolvePeriodFromQuestion(question, requestedPeriod = "24h") {
  const normalized = normalizeText(question);

  if (containsAny(normalized, ["ontem", "dia anterior", "yesterday"])) {
    return "yesterday";
  }

  if (containsAny(normalized, ["ultima semana", "ultimos 7 dias", "semana passada", "last week"])) {
    return "7d";
  }

  if (containsAny(normalized, ["hoje", "today"])) {
    return "today";
  }

  if (containsAny(normalized, ["ultima hora", "ultimas 1 hora", "last hour", "1h"])) {
    return "1h";
  }

  if (containsAny(normalized, ["24h", "24 horas", "ultimas 24 horas", "last 24 hours"])) {
    return "24h";
  }

  return requestedPeriod || "24h";
}

function resolveIntent(question, requestedIntent = "") {
  const normalized = normalizeText(question);
  const explicitIntent = normalizeRequestedIntent(requestedIntent);

  if (explicitIntent && explicitIntent !== "summary") {
    return explicitIntent;
  }

  const shape = detectQuestionShape(question);

  if (containsAny(normalized, ["evento", "event"]) && containsAny(normalized, ["quanto dinheiro", "dinheiro", "em jogo", "stake", "exposicao", "exposição", "quantas apostas", "numero de apostas", "número de apostas"])) {
    return "event-summary";
  }

  if (shape === "count-bets") {
    return "selection-summary";
  }

  if (containsAny(normalized, ["evento", "event"]) && containsAny(normalized, ["quantas apostas", "quantos apostas", "numero de apostas", "número de apostas"]) && containsAny(normalized, ["mercado", "market"])) {
    return "event-summary";
  }

  if (containsAny(normalized, ["legs"])) {
    return "legs";
  }

  if (containsAny(normalized, ["mercado mais comum", "market mais comum", "mercado mais usado", "mercado mais frequente"])) {
    return "bettype-top";
  }

  if (containsAny(normalized, ["odd mais alta", "maior odd", "odd mais alta"]) && containsAny(normalized, ["evento", "event", "mercado", "market"])) {
    return "event-highest-odd";
  }

  if (containsAny(normalized, ["odd mais alta", "maior odd", "odd mais alta"])) {
    return "highest-odd";
  }

  if (containsAny(normalized, ["prejuizo", "perda max", "maior perda", "pode dar prejuizo"])) {
    return "top-loss-bet";
  }

  if (containsAny(normalized, ["maior exposicao potencial", "maior exposição potencial", "maior exposicao", "maior exposição"])) {
    return "top-loss-bet";
  }

  if (containsAny(normalized, ["evento", "event"]) && containsAny(normalized, ["quanto dinheiro", "dinheiro", "em jogo", "stake", "exposicao", "exposição"])) {
    return "event-summary";
  }

  if (containsAny(normalized, ["distribuicao de bets por bettype", "por bettype", "bettype hoje", "bet type hoje"])) {
    return "bettype-distribution";
  }

  if ((containsAny(normalized, ["distribuicao", "distribuição"]) && containsAny(normalized, ["mercados", "mercado"]))) {
    return "bettype-distribution";
  }

  if (containsAny(normalized, ["bettype mais comum", "bet type mais comum", "tipo de aposta mais comum"])) {
    return "bettype-top";
  }

  if (containsAny(normalized, ["quantas selections tem o evento", "numero de selections do evento", "número de selections do evento"])) {
    return "event-selection-count";
  }

  if (containsAny(normalized, ["evento", "event", "sobre o evento", "diz me tudo", "fala me do evento", "tudo sobre" ])) {
    return "event-summary";
  }

  if (containsAny(normalized, ["odd mais usada", "odd mais frequente", "odd mais repetida"])) {
    return "selection-odd-mode";
  }

  if (containsAny(normalized, ["media de odd", "odd media"])) {
    return "selection-average-odd";
  }

  if (containsAny(normalized, ["selection que teve mais apostas", "selection com mais apostas", "selection mais apostada", "mais apostas ontem"])) {
    return "selection-top";
  }

  if (containsAny(normalized, ["ultimas 5 apostas", "últimas 5 apostas"])) {
    return "recent";
  }

  if (containsAny(normalized, ["top desportos", "top sports", "desportos mais", "sports mais"])) {
    return "top-sports";
  }

  if (containsAny(normalized, ["altura do dia", "hora do dia", "momento do dia", "pico de apostas"])) {
    return normalized.includes("sport") || normalized.includes("desporto") ? "peak-hour-sport" : "peak-hour";
  }

  if (containsAny(normalized, ["por desporto", "by sport", "desporto", "sport"])) {
    return "by-sport";
  }

  if (containsAny(normalized, ["risco", "risk"])) {
    return "by-risk";
  }
  if (containsAny(normalized, ["maior stake", "mais stake", "aposta com mais stake"])) {
    return "top-stake";
  }

  if (containsAny(normalized, ["ultimas 5 apostas", "últimas 5 apostas", "ultimas apostas", "últimas apostas", "recent"])) {
    return "recent";
  }
  if (containsAny(normalized, ["ultimas apostas", "últimas apostas", "recent" ])) {
    return "recent";
  }

  return "summary";
}

function filterByField(bets, fieldName, targetValue) {
  const normalizedTarget = normalizeText(targetValue);

  return bets.filter((bet) => normalizeText(bet?.[fieldName]) === normalizedTarget);
}

function formatPeriodLabel(period) {
  switch (period) {
    case "yesterday":
      return "ontem";
    case "today":
      return "hoje";
    case "1h":
      return "na última hora";
    case "24h":
      return "nas últimas 24 horas";
    case "7d":
      return "na última semana";
    default:
      return period;
  }
}

function buildPeriodIntro(periodLabel) {
  switch (periodLabel) {
    case "hoje":
      return "Hoje";
    case "ontem":
      return "Ontem";
    case "na última hora":
      return "Na última hora";
    case "nas últimas 24 horas":
      return "Nas últimas 24 horas";
    case "na última semana":
      return "Na última semana";
    default:
      return `No período ${periodLabel}`;
  }
}

function buildDistributionText(items, keyName, valueFormatter = (value) => String(value)) {
  return items
    .map((item) => `${item[keyName]}: ${valueFormatter(item)}`)
    .join("; ");
}

function formatHourLabel(hourBucket) {
  if (!hourBucket) {
    return "hora desconhecida";
  }

  return `${String(hourBucket.hour).padStart(2, "0")}:00`;
}

function buildResponse({ intent, period, question, analytics, bets }) {
  const safeQuestion = String(question || "").trim();
  const periodLabel = formatPeriodLabel(period);
  const matchedSport = findBestMatch(safeQuestion, analytics.sports, "sport");
  const matchedEvent = findBestMatch(safeQuestion, analytics.events, "event");
  const matchedSelection = resolveSelectionTarget(safeQuestion, analytics);

  if (intent === "summary") {
    return {
      data: analytics.summary,
      explanation: `Resumo de apostas ${periodLabel}. Total de apostas: ${analytics.summary.totalBets}, stake total: €${analytics.summary.totalStake.toFixed(2)}, exposição: €${analytics.summary.totalExposure.toFixed(2)}.`,
    };
  }

  if (intent === "by-sport") {
    const targetSport = resolveSportTarget(safeQuestion, analytics);
    const sportsToUse = targetSport
      ? bets.filter((bet) => normalizeText(bet.sport) === normalizeText(targetSport.sport))
      : bets;
    const sportAnalytics = targetSport ? buildBetAnalytics(sportsToUse) : analytics;

    return {
      data: {
        period,
        sport: targetSport?.sport || null,
        sports: sportAnalytics.sports,
        summary: sportAnalytics.summary,
      },
      explanation: targetSport
        ? `Estatísticas do sport ${targetSport.sport} ${periodLabel}: ${sportAnalytics.summary.totalBets} apostas, stake total de €${sportAnalytics.summary.totalStake.toFixed(2)} e exposição de €${sportAnalytics.summary.totalExposure.toFixed(2)}.`
        : `Estatísticas por desporto ${periodLabel}: ${sportAnalytics.sports.map((sport) => `${sport.sport} (${sport.betCount} apostas, stake €${sport.totalStake.toFixed(2)}, exposição €${sport.totalExposure.toFixed(2)})`).join("; ")}.`,
    };
  }

  if (intent === "top-sports") {
    const topSports = analytics.sports.slice(0, 3);

    return {
      data: {
        period,
        sports: topSports,
      },
      explanation: topSports.length > 0
        ? `Top 3 desportos ${periodLabel}: ${topSports.map((sport) => `${sport.sport} (${sport.betCount})`).join("; ")}.`
        : "Não encontrei desportos suficientes para listar o top.",
    };
  }

  if (intent === "by-risk") {
    return {
      data: { period, riskBuckets: analytics.riskBuckets },
      explanation: `Distribuição de risco ${periodLabel}.`,
    };
  }
  if (intent === "recent") {
    const recentBets = analytics.recentBets.slice(0, Number(bets?.length ? 5 : 5));
    return {
      data: {
        period,
        recentBets,
      },
      explanation: recentBets.length > 0
        ? `Últimas ${recentBets.length} apostas ${periodLabel}: ${recentBets.map((bet) => `${bet.sport} - ${bet.selection}`).join("; ")}.`
        : "Não encontrei apostas recentes para mostrar.",
    };
  }
  if (intent === "top-stake") {
    const topStake = analytics.summary.highestStakeBet;
    return {
      data: {
        period,
        bet: topStake || null,
      },
      explanation: topStake
        ? `A aposta com maior stake é ${topStake.sport} - ${topStake.event} - ${topStake.selection}, com stake de €${topStake.stake.toFixed(2)}.`
        : "Não encontrei apostas suficientes para identificar a maior stake.",
    };
  }

  if (intent === "bettype-distribution") {
    const distribution = analytics.betTypes
      .map((item) => ({
        betType: item.betType,
        betCount: item.betCount,
        totalStake: item.totalStake,
        totalExposure: item.totalExposure,
        averageOdd: item.averageOdd,
      }));

    return {
      data: { period, betTypes: distribution },
      explanation: `Distribuição de bets por betType ${periodLabel}: ${buildDistributionText(distribution, "betType", (item) => `${item.betCount} apostas`)}.`,
    };
  }

  if (intent === "bettype-top") {
    const filteredBets = matchedSport
      ? bets.filter((bet) => normalizeText(bet.sport) === normalizeText(matchedSport.sport))
      : bets;
    const filteredAnalytics = buildBetAnalytics(filteredBets);
    const topBetType = filteredAnalytics.betTypes[0];

    return {
      data: {
        period,
        sport: matchedSport?.sport || null,
        betTypes: filteredAnalytics.betTypes,
      },
      explanation: topBetType
        ? `No${matchedSport?.sport ? ` sport ${matchedSport.sport}` : " período solicitado"}, o betType mais comum é ${topBetType.betType} com ${topBetType.betCount} apostas.`
        : "Não encontrei dados suficientes para determinar o betType mais comum.",
    };
  }

  if (intent === "highest-odd") {
    const topOdd = analytics.summary.highestOddBet;

    return {
      data: {
        period,
        bet: topOdd || null,
      },
      explanation: topOdd
        ? `A aposta com a odd mais alta é ${topOdd.sport} - ${topOdd.event} - ${topOdd.selection}, com odd ${topOdd.odd.toFixed(2)}.`
        : "Não encontrei apostas suficientes para identificar a odd mais alta.",
    };
  }

    if (intent === "event-highest-odd") {
      if (!matchedEvent) {
        return {
          data: { period, event: null },
          explanation: "Não consegui identificar o evento pedido.",
        };
      }

      const eventBets = bets.filter((bet) => normalizeText(bet.event) === normalizeText(matchedEvent.event));
      const matchedMarket = resolveMarketTarget(safeQuestion, analytics);
      const scopedEventBets = matchedMarket
        ? eventBets.filter((bet) => normalizeText(bet.betType) === normalizeText(matchedMarket.betType))
        : eventBets;
      const scopedAnalytics = buildBetAnalytics(scopedEventBets.length > 0 ? scopedEventBets : eventBets);
      const topOdd = scopedAnalytics.summary.highestOddBet;

      return {
        data: {
          period,
          event: matchedEvent.event,
          market: matchedMarket ? matchedMarket.betType : null,
          bet: topOdd || null,
        },
        explanation: topOdd
          ? `No evento ${matchedEvent.event}${matchedMarket ? ` no mercado ${matchedMarket.betType}` : ""}, a odd mais alta é ${topOdd.selection} com odd ${topOdd.odd.toFixed(2)}.`
          : "Não encontrei apostas suficientes para identificar a odd mais alta nesse evento.",
      };
    }

  if (intent === "selection-top") {
    const topSelection = analytics.selections[0];

    return {
      data: {
        period,
        selection: topSelection || null,
      },
      explanation: topSelection
        ? `A selection com mais apostas ${periodLabel} foi ${topSelection.selection}, com ${topSelection.betCount} apostas.`
        : "Não encontrei selections para o período pedido.",
    };
  }

  if (intent === "selection-summary") {
    if (!matchedSelection) {
      return {
        data: { period, selection: null },
        explanation: "Não consegui identificar a seleção pedida.",
      };
    }

    const selectionRows = bets.filter((bet) => normalizeText(bet.selection) === normalizeText(matchedSelection.selection));
    const selectionAnalytics = buildBetAnalytics(selectionRows);
    const mostUsedOddEntry = selectionRows.reduce((map, bet) => {
      const oddKey = Number(bet.odd).toFixed(2);
      map.set(oddKey, (map.get(oddKey) || 0) + 1);
      return map;
    }, new Map());
    const mostUsedOdd = [...mostUsedOddEntry.entries()].sort((left, right) => right[1] - left[1] || Number(right[0]) - Number(left[0]))[0];
    const askedWinLikeSelection = containsAny(normalizeText(safeQuestion), ["ganhar", "a ganhar", "vencer", "vence", "win"]);
    const isExactWinSelection = containsAny(normalizeText(matchedSelection.selection), ["to win", "ganhar", "vencer", "win"]);
    const interpretationNote = askedWinLikeSelection && !isExactWinSelection
      ? ` Interpretei a tua pergunta como a seleção mais próxima disponível: ${matchedSelection.selection}.`
      : "";
    const matchedEventForSelection = findBestMatch(safeQuestion, analytics.events, "event");
    const eventNote = matchedEventForSelection
      ? ` Evento associado: ${matchedEventForSelection.event}.`
      : "";

    return {
      data: {
        period,
        selection: selectionAnalytics.selections[0] || null,
        mostUsedOdd: mostUsedOdd ? { odd: Number(mostUsedOdd[0]), count: mostUsedOdd[1] } : null,
      },
      explanation: `${interpretationNote}${eventNote} Na selection ${matchedSelection.selection} há ${selectionAnalytics.summary.totalBets} apostas, stake total de €${selectionAnalytics.summary.totalStake.toFixed(2)}, exposição de €${selectionAnalytics.summary.totalExposure.toFixed(2)}.` +
        (mostUsedOdd ? ` A odd mais usada é ${Number(mostUsedOdd[0]).toFixed(2)}.` : ""),
    };
  }

  if (intent === "event-summary") {
    if (!matchedEvent) {
      return {
        data: { period, event: null },
        explanation: "Não consegui identificar o evento pedido.",
      };
    }

    const eventBets = bets.filter((bet) => normalizeText(bet.event) === normalizeText(matchedEvent.event));
    const matchedMarket = resolveMarketTarget(safeQuestion, analytics);
    const scopedEventBets = matchedMarket
      ? eventBets.filter((bet) => normalizeText(bet.betType) === normalizeText(matchedMarket.betType))
      : eventBets;
    const eventAnalytics = buildBetAnalytics(scopedEventBets.length > 0 ? scopedEventBets : eventBets);
    const topSelection = eventAnalytics.selections[0];
    const topBetType = eventAnalytics.betTypes[0];

    const wantsMoney = containsAny(normalizeText(safeQuestion), ["quanto dinheiro", "dinheiro", "em jogo", "stake", "exposicao", "exposição"]);
    const marketSuffix = matchedMarket && scopedEventBets.length > 0 ? ` no mercado ${matchedMarket.betType}` : "";
    const marketFallbackNote = matchedMarket && scopedEventBets.length === 0
      ? ` Não encontrei apostas no mercado ${matchedMarket.betType}, por isso usei o total do evento.`
      : "";

    return {
      data: {
        period,
        event: matchedEvent.event,
        market: matchedMarket ? { betType: matchedMarket.betType, filteredBetCount: scopedEventBets.length } : null,
        betCount: eventAnalytics.summary.totalBets,
        totalStake: eventAnalytics.summary.totalStake,
        totalExposure: eventAnalytics.summary.totalExposure,
        averageOdd: eventAnalytics.summary.averageOdd,
        selectionCount: eventAnalytics.selections.length,
        selections: eventAnalytics.selections,
        betTypes: eventAnalytics.betTypes,
        topSelection: topSelection || null,
        topBetType: topBetType || null,
      },
      explanation: wantsMoney
        ? `No evento ${matchedEvent.event}${marketSuffix} há ${eventAnalytics.summary.totalBets} apostas, stake total de €${eventAnalytics.summary.totalStake.toFixed(2)} e exposição de €${eventAnalytics.summary.totalExposure.toFixed(2)}.${marketFallbackNote}`
        : `No evento ${matchedEvent.event}${marketSuffix} há ${eventAnalytics.summary.totalBets} apostas, ${eventAnalytics.selections.length} selections distintas, stake total de €${eventAnalytics.summary.totalStake.toFixed(2)} e exposição de €${eventAnalytics.summary.totalExposure.toFixed(2)}.${marketFallbackNote}` +
          (topSelection ? ` A selection mais apostada é ${topSelection.selection} com ${topSelection.betCount} apostas.` : "") +
          (topBetType ? ` O betType mais comum é ${topBetType.betType}.` : ""),
    };
  }

  if (intent === "selection-odd-mode" || intent === "selection-average-odd") {
    const selectionRows = matchedSelection
      ? filterByField(bets, "selection", matchedSelection.selection)
      : [];

    if (!matchedSelection || selectionRows.length === 0) {
      return {
        data: {
          period,
          selection: null,
        },
        explanation: "Identifiquei a selection pedida, mas não encontrei apostas para ela no período consultado.",
      };
    }

    const selectionAnalytics = buildBetAnalytics(selectionRows);
    const modes = new Map();

    for (const bet of selectionRows) {
      const oddKey = Number(bet.odd).toFixed(2);
      modes.set(oddKey, (modes.get(oddKey) || 0) + 1);
    }

    const mostUsedOddEntry = [...modes.entries()].sort((left, right) => right[1] - left[1] || Number(right[0]) - Number(left[0]))[0];
    const askedWinLikeSelection = containsAny(normalizeText(safeQuestion), ["ganhar", "a ganhar", "vencer", "vence", "win"]);
    const isExactWinSelection = containsAny(normalizeText(matchedSelection.selection), ["to win", "ganhar", "vencer", "win"]);
    const interpretationNote = askedWinLikeSelection && !isExactWinSelection
      ? ` Interpretei a tua pergunta como a seleção mais próxima disponível: ${matchedSelection.selection}.`
      : "";
    const matchedEventForSelection = findBestMatch(safeQuestion, analytics.events, "event");
    const eventNote = matchedEventForSelection
      ? ` Evento associado: ${matchedEventForSelection.event}.`
      : "";

    return {
      data: {
        period,
        selection: selectionAnalytics.selections[0] || null,
        mostUsedOdd: mostUsedOddEntry ? { odd: Number(mostUsedOddEntry[0]), count: mostUsedOddEntry[1] } : null,
        averageOdd: selectionAnalytics.summary.averageOdd,
      },
      explanation: intent === "selection-odd-mode"
        ? `${interpretationNote}${eventNote} Na selection ${matchedSelection.selection}, a odd mais usada foi ${mostUsedOddEntry ? Number(mostUsedOddEntry[0]).toFixed(2) : "n/a"} (${mostUsedOddEntry ? mostUsedOddEntry[1] : 0} apostas).`
        : `${interpretationNote}${eventNote} Na selection ${matchedSelection.selection}, a média de odd é ${selectionAnalytics.summary.averageOdd.toFixed(2)}.`,
    };
  }

  if (intent === "event-selection-count") {
    if (!matchedEvent) {
      return {
        data: { period, event: null },
        explanation: "Não consegui identificar o evento pedido.",
      };
    }

    return {
      data: {
        period,
        event: matchedEvent,
      },
      explanation: `O evento ${matchedEvent.event} tem ${matchedEvent.selectionCount || 0} selections distintas no período ${periodLabel}.`,
    };
  }

  if (intent === "top-loss-bet") {
    const topBet = analytics.summary.highestExposureBet;

    return {
      data: {
        period,
        bet: topBet,
      },
      explanation: topBet
        ? `A aposta com maior exposição potencial é ${topBet.sport} - ${topBet.event} - ${topBet.selection}, com exposição de €${topBet.exposure.toFixed(2)}.`
        : "Não encontrei apostas suficientes para calcular o maior prejuízo potencial.",
    };
  }

  if (intent === "peak-hour") {
    return {
      data: {
        period,
        peakHour: analytics.peakHour,
        hourBuckets: analytics.hourBuckets,
      },
      explanation: `${buildPeriodIntro(periodLabel)}, a altura do dia com mais apostas foi ${formatHourLabel(analytics.peakHour)}, com ${analytics.peakHour?.betCount || 0} apostas.`,
    };
  }

  if (intent === "peak-hour-sport") {
    if (!matchedSport) {
      return {
        data: { period, sport: null },
        explanation: "Não consegui identificar o sport pedido.",
      };
    }

    const sportBets = bets.filter((bet) => normalizeText(bet.sport) === normalizeText(matchedSport.sport));
    const sportAnalytics = buildBetAnalytics(sportBets);

    return {
      data: {
        period,
        sport: matchedSport.sport,
        peakHour: sportAnalytics.peakHour,
        hourBuckets: sportAnalytics.hourBuckets,
      },
      explanation: `No sport ${matchedSport.sport}, ${buildPeriodIntro(periodLabel).toLowerCase()} tivemos mais apostas às ${formatHourLabel(sportAnalytics.peakHour)}, com ${sportAnalytics.peakHour?.betCount || 0} apostas.`,
    };
  }

  if (intent === "legs") {
    return {
      data: {
        period,
        supported: false,
      },
      explanation: "Esta base não guarda um campo de legs. As apostas são single-leg, por isso não consigo calcular uma bet com mais legs.",
    };
  }

  return {
    data: analytics.summary,
    explanation: `Resumo de apostas ${periodLabel}. Total de apostas: ${analytics.summary.totalBets}.`,
  };
}

export async function answerAssistantQuery({ question = "", intent = "", params = {} } = {}) {
  const safeQuestion = String(question || "").trim();
  const resolvedIntent = resolveIntent(safeQuestion, intent);
  const resolvedPeriod = resolvePeriodFromQuestion(safeQuestion, params.period || "24h");

  if (!safeQuestion && !resolvedIntent) {
    throw new Error("É necessário enviar uma pergunta ou intent.");
  }

  const primaryPeriod = resolvedPeriod;
  const fallbackPeriod = primaryPeriod === "yesterday" ? "24h" : null;

  let analytics = await getDetailedAnalytics({ period: primaryPeriod });
  let effectivePeriod = primaryPeriod;
  let usedFallback = false;

  async function useBroaderFallbackPeriod() {
    if (effectivePeriod === "7d") {
      return;
    }

    const fallbackAnalytics = await getDetailedAnalytics({ period: "7d" });
    if (fallbackAnalytics.summary.totalBets > 0) {
      analytics = fallbackAnalytics;
      effectivePeriod = "7d";
      usedFallback = true;
    }
  }

  if (resolvedIntent === "selection-summary" || resolvedIntent === "selection-odd-mode" || resolvedIntent === "selection-average-odd") {
    const selectionTarget = resolveSelectionTarget(safeQuestion, analytics);
    const selectionRows = selectionTarget
      ? analytics.allBets.filter((bet) => normalizeText(bet.selection) === normalizeText(selectionTarget.selection))
      : [];

    if (selectionTarget && selectionRows.length === 0 && effectivePeriod !== "7d") {
      await useBroaderFallbackPeriod();
    }
  }

  if (resolvedIntent === "event-summary" || resolvedIntent === "event-selection-count") {
    const eventTarget = findBestMatch(safeQuestion, analytics.events, "event");
    const marketTarget = resolveMarketTarget(safeQuestion, analytics);
    const eventRows = eventTarget
      ? analytics.allBets.filter((bet) => normalizeText(bet.event) === normalizeText(eventTarget.event))
      : [];
    const scopedRows = marketTarget
      ? eventRows.filter((bet) => normalizeText(bet.betType) === normalizeText(marketTarget.betType))
      : eventRows;

    if (eventTarget && scopedRows.length === 0 && effectivePeriod !== "7d") {
      await useBroaderFallbackPeriod();
    }
  }

  if (primaryPeriod === "yesterday" && analytics.summary.totalBets === 0 && fallbackPeriod) {
    const fallbackAnalytics = await getDetailedAnalytics({ period: fallbackPeriod });
    if (fallbackAnalytics.summary.totalBets > 0) {
      analytics = fallbackAnalytics;
      effectivePeriod = fallbackPeriod;
      usedFallback = true;
    }
  }

  if (resolvedIntent === "summary" || resolvedIntent === "by-sport" || resolvedIntent === "by-risk") {
    const response = buildResponse({
      intent: resolvedIntent,
      period: effectivePeriod,
      question: safeQuestion,
      analytics,
      bets: analytics.allBets,
    });

    return {
      intent: resolvedIntent,
      params: { ...params, period: effectivePeriod },
      data: response.data,
      explanation: usedFallback
        ? `${response.explanation} Não havia registos em ${formatPeriodLabel(primaryPeriod)}, por isso usei ${formatPeriodLabel(effectivePeriod)}.`
        : response.explanation,
    };
  }

  const bets = analytics.allBets;

  return {
    intent: resolvedIntent,
    params: { ...params, period: effectivePeriod },
    ...(() => {
      const response = buildResponse({ intent: resolvedIntent, period: effectivePeriod, question: safeQuestion, analytics, bets });

      if (!usedFallback) {
        return response;
      }

      return {
        ...response,
        explanation: `${response.explanation} Não havia registos em ${formatPeriodLabel(primaryPeriod)}, por isso usei ${formatPeriodLabel(effectivePeriod)}.`,
      };
    })(),
  };
}
