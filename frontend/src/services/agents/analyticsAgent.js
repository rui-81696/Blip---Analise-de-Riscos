/**
 * Agente de Analytics (Insights) — parte do sistema MULTIAGENTE do Risk Assistant.
 *
 * Responsabilidade
 * ----------------
 * Responder de forma FIÁVEL a perguntas factuais/estatísticas sobre as apostas:
 *   • selection com mais apostas (período)
 *   • odd mais usada (moda) numa selection
 *   • nº de selections distintas de um evento
 *   • odd média numa selection
 *   • bet com maior prejuízo potencial para a casa
 *   • distribuição de bets por betType
 *   • bet com mais legs
 *   • betType mais comum (geral ou por desporto)
 *   • hora/altura do dia de pico (geral, por desporto, e por janela alargada)
 *
 * Porquê um agente dedicado e DETERMINÍSTICO?
 * -------------------------------------------
 * O modelo (Llama-1B via WebLLM) é fraco a fazer routing: confundia
 * "sport Football" / "evento X" com uma *selection*, escolhia a tool errada e
 * devolvia "0,00 / não há apostas"; e o compositor corrompia respostas já
 * corretas (cortava-as para "Nota: 1440,93", inventava betTypes como "Parlay" e
 * deixava escapar "User:"/"Assistant:"). Aqui o ROUTING e o CÁLCULO são
 * determinísticos (corretos por construção) e o LLM é usado apenas para
 * reformular o texto — e mesmo essa reformulação é VALIDADA contra os dados; se
 * se desviar, usa-se a frase determinística.
 *
 * Este módulo é AUTÓNOMO no caminho determinístico (não importa o WebLLM). A
 * camada opcional de "polish" via LLM é injetada pelo orquestrador
 * (webllmClient), que é o dono do motor — assim o agente não tem dependências
 * do WebLLM e é facilmente testável.
 */

import { runTool } from "../../utils/betsAnalytics";

// Tools de analytics que este agente sabe encaminhar (subconjunto do TOOL_CATALOG).
export const ANALYTICS_TOOLS = new Set([
  "top-selection",
  "selection-odd-mode",
  "event-selection-count",
  "selection-average-odd",
  "top-loss-bet",
  "bettype-distribution",
  "max-legs",
  "top-bettype-sport",
  "bettype-top",
  "peak-hour",
  "peak-hour-sport",
]);

// NOTA: o agente NÃO tem uma lista de perguntas suportadas. Responde a QUALQUER
// fraseado dos géneros acima — o routing (routeAnalytics) é por intenção e
// sinónimos, não por correspondência a frases fixas.

// ─── Normalização ───────────────────────────────────────────────────────────

function normalize(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ─── Período pedido na frase ─────────────────────────────────────────────────
// Mantém-se dentro da janela que o assistant carrega (7 dias). "última semana"
// e variantes → 7d (a janela alargada que o utilizador pediu).
function detectPeriod(qn, fallback = "today") {
  if (/\bontem\b|\byesterday\b/.test(qn)) return "yesterday";
  if (/\bultima semana\b|\bsemana passada\b|\blast week\b|\b7 dias\b|\bultimos 7 dias\b|\bnesta semana\b|\besta semana\b/.test(qn)) return "7d";
  if (/\bultima hora\b|\blast hour\b/.test(qn)) return "1h";
  if (/\bhoje\b|\btoday\b/.test(qn)) return "today";
  if (/\bultimas? 24 ?h\b|\b24 horas\b/.test(qn)) return "24h";
  return fallback;
}

// ─── Extração de selection / evento / desporto ───────────────────────────────
// Apenas frases TEMPORAIS e pontuação terminam o "valor". Assim preservamos
// nomes com espaços ("Manchester United vs Liverpool") e handicaps com sinais
// ("Marseille +1.5") — o "." só corta se for fim de frase (ponto + espaço/fim),
// nunca o "." de um handicap.
const STOP_RE =
  /(?:\s+(?:com base|basead[oa]|baseando|durante|na ultima|no ultimo|nas ultimas|nos ultimos|ultim[oa]s?|esta semana|este mes|este mês|hoje|ontem)\b|[?!,;]|\.\s|\.$)/i;

function extractAfter(originalQuestion, labelRe) {
  // Inclui letras acentuadas, dígitos, espaço e os sinais . + / ' - para
  // apanhar handicaps e nomes compostos.
  const re = new RegExp(`(?:${labelRe})\\s+([A-Za-zÀ-ÿ0-9 .+/'-]{1,80})`, "i");
  const match = String(originalQuestion).match(re);
  if (!match) return null;

  let raw = match[1].trim();
  const stop = raw.match(STOP_RE);
  if (stop && stop.index > 0) raw = raw.slice(0, stop.index);
  raw = raw.trim();
  return raw.length >= 1 ? raw : null;
}

const extractSelection = (q) => extractAfter(q, "selection|sele[cç][aã]o|selecao|sele[cç][aã]es|selecoes|aposta(?:s)? (?:em|na|no|de|do|da)|opcao|opção");
const extractEvent = (q) => extractAfter(q, "evento|event|jogo|partida|encontro|match|fixture");
const extractSport = (q) => extractAfter(q, "sport|desporto|esporte|modalidade");

function mentionsSport(qn) {
  return /\bsport\b|\bdesporto\b|\besporte\b|\bmodalidade\b/.test(qn);
}

// Desportos comuns — permite detetar a variante "por desporto" mesmo quando o
// utilizador não escreve a palavra "sport"/"desporto" (ex.: "betType mais comum
// no Tennis?"). A lista é só uma ajuda; a correspondência final é feita por
// fuzzyMatch contra os desportos REAIS do dataset, dentro de cada tool.
const SPORT_HINTS = [
  "football", "futebol", "soccer", "tennis", "tenis", "basketball", "basket", "basquetebol",
  "basquete", "hoquei", "hoquei no gelo", "hockey", "ice hockey", "andebol", "handball",
  "voleibol", "volei", "volleyball", "baseball", "basebol", "rugby", "cricket", "criquete",
  "formula 1", "formula1", "f1", "golf", "golfe", "mma", "ufc", "boxe", "boxing", "esports",
  "e-sports", "dardos", "darts", "snooker", "badminton", "ciclismo", "futsal",
];

// Devolve o desporto referido: primeiro tenta a etiqueta explícita
// ("sport/desporto X"), depois procura uma pista de desporto na frase.
function detectSport(original, qn) {
  const labelled = extractSport(original);
  if (labelled) return labelled;
  for (const hint of SPORT_HINTS) {
    if (qn.includes(normalize(hint))) return hint;
  }
  return null;
}

// ─── Vocabulário de intenção (abrangente → generaliza a QUALQUER fraseado) ───
// Cada grupo reúne MUITAS formas de exprimir a mesma ideia. O router combina
// "entidade" (selection/evento/desporto/odd/betType/legs/prejuízo/tempo) com
// "agregação" (mais/média/moda/contagem/distribuição) — responde a QUALQUER
// fraseado destes géneros, não a uma lista de frases fixas.
const VOLUME = [
  "mais apostas", "mais apostada", "mais apostado", "mais apostadas", "mais bets", "maior volume",
  "mais volume", "maior numero de apostas", "maior quantidade de apostas", "mais popular",
  "mais jogada", "mais jogado", "mais escolhida", "mais escolhido", "mais procurada", "mais procurado",
  "teve mais", "com mais apostas", "recebeu mais", "campea de apostas", "mais bilhetes", "mais palpites",
];
const AVG = ["media", "medio", "em media", "average", "valor medio", "na media", "media de", "media das"];
const MODE = [
  "mais usada", "mais usado", "mais frequente", "mais comum", "mais repetida", "mais repetido",
  "moda", "habitual", "tipica", "tipico", "recorrente", "predominante", "mais vezes", "que mais aparece",
  "mais aplicada", "mais aplicado",
];
const COUNT = [
  "quantas", "quantos", "numero de", "n de", "quantidade de", "total de", "quantas distintas",
  "quantas diferentes", "quantas ha", "quantas existem", "quantas tem", "quantas teem",
];
const DISTRIBUTION = [
  "distribuicao", "reparticao", "breakdown", "split", "como se divide", "como se dividem",
  "como se distribui", "como se distribuem", "como estao distribuidas", "como estao divididas",
  "por betType", "por bet type", "por tipo", "proporcao", "percentagem por", "peso de cada",
];
const TIME = [
  "altura do dia", "hora do dia", "a que horas", "que horas", "quando", "em que hora", "em que altura",
  "periodo do dia", "franja horaria", "pico", "hora de maior", "horario", "hora com mais", "altura com mais",
  "hora de pico", "horas de maior", "hora mais movimentada", "momento do dia",
];
const LOSS = [
  "prejuizo", "perda", "perdas", "perder", "exposicao", "liability", "responsabilidade",
  "risco para a casa", "expoe a casa", "expoe mais a casa", "pior para a casa", "mais arriscada para a casa",
  "maior risco", "mais pode custar", "mais cara para a casa", "maior pagamento potencial",
];
const LEGS = ["legs", "leg", "pernas", "perna", "combinada", "multipla", "acumulada", "selecoes na bet"];

/**
 * Decide a tool de analytics e os params, de forma determinística.
 * Combina entidade + agregação com sinónimos abrangentes, para cobrir qualquer
 * fraseado dos géneros suportados (não apenas as frases-exemplo).
 * @returns {{ tool:string, params:object, intent:string } | null}
 */
export function routeAnalytics(question = "") {
  const original = String(question || "");
  const qn = normalize(original);
  if (!qn) return null;

  // Não invade a gestão de Regras de Highlight (é de outro agente). Evita que
  // "desativa a regra de exposição" seja apanhado pelo padrão de prejuízo.
  if (/\bregra(s)?\b|\bhighlight\b|\bdestac|\brealc/.test(qn)) return null;

  const has = (...subs) => subs.some((s) => qn.includes(normalize(s)));
  const hasAny = (list) => list.some((s) => qn.includes(normalize(s)));

  // Entidades referidas na pergunta.
  const hasSelection = has("selection", "selections", "selecao", "selecoes", "seleccao");
  const hasEvent = has("evento", "event", "jogo", "partida", "encontro", "match", "fixture");
  const hasOdd = has("odd", "odds", "cotacao", "cota");
  const hasBetType = has("bettype", "bet type", "tipo de aposta", "tipo de bet", "tipos de aposta", "mercado", "mercados");
  const hasLeg = hasAny(LEGS);
  const sport = detectSport(original, qn);
  const hasSport = mentionsSport(qn) || Boolean(sport);

  // 1) PICO / hora do dia (com ou sem desporto). Prioritário porque "mais
  //    apostas" também surge noutros géneros.
  if (hasAny(TIME) && (hasAny(VOLUME) || has("apostas", "bets", "apostar", "atividade", "movimento"))) {
    if (hasSport) {
      return {
        intent: "peak-hour-sport",
        tool: "peak-hour-sport",
        params: { period: detectPeriod(qn, "7d"), ...(sport && { sport }) },
      };
    }
    return { intent: "peak-hour", tool: "peak-hour", params: { period: detectPeriod(qn, "today") } };
  }

  // 2) Nº de selections distintas de um evento. (COUNT + selection, ou evento + selection)
  if (
    (hasAny(COUNT) && hasSelection) ||
    (hasEvent && hasSelection && !hasAny(VOLUME)) ||
    has("quantas opcoes", "quantos resultados", "quantas hipoteses", "quantas escolhas")
  ) {
    const event = extractEvent(original);
    return {
      intent: "event-selection-count",
      tool: "event-selection-count",
      params: { period: detectPeriod(qn, "all"), ...(event && { event }) },
    };
  }

  // 3) ODD de uma selection — média ou moda (mais usada).
  if (hasOdd && (hasAny(AVG) || hasAny(MODE) || hasSelection)) {
    const selection = extractSelection(original);
    if (hasAny(AVG)) {
      return {
        intent: "selection-average-odd",
        tool: "selection-average-odd",
        params: { period: detectPeriod(qn, "24h"), ...(selection && { selection }) },
      };
    }
    // Default das perguntas de odd numa selection: a odd mais usada (moda).
    return {
      intent: "selection-odd-mode",
      tool: "selection-odd-mode",
      params: { period: detectPeriod(qn, "24h"), ...(selection && { selection }) },
    };
  }

  // 4) Bet com maior prejuízo potencial para a casa.
  if (hasAny(LOSS)) {
    return { intent: "top-loss-bet", tool: "top-loss-bet", params: { period: detectPeriod(qn, "24h") } };
  }

  // 5) Distribuição por betType.
  if (hasBetType && (hasAny(DISTRIBUTION) || has("por betType", "por bet type", "por tipo"))) {
    return { intent: "bettype-distribution", tool: "bettype-distribution", params: { period: detectPeriod(qn, "today") } };
  }

  // 6) Bet com mais legs.
  if (hasLeg && (hasAny(VOLUME) || hasAny(COUNT) || has("mais", "maior"))) {
    return { intent: "max-legs", tool: "max-legs", params: { period: detectPeriod(qn, "all") } };
  }

  // 7) betType mais comum (por desporto ou geral).
  if (hasBetType && hasAny(MODE)) {
    if (hasSport) {
      return {
        intent: "top-bettype-sport",
        tool: "top-bettype-sport",
        params: { period: detectPeriod(qn, "24h"), ...(sport && { sport }) },
      };
    }
    return { intent: "bettype-top", tool: "bettype-top", params: { period: detectPeriod(qn, "24h") } };
  }

  // 8) Selection com mais apostas.
  if (hasSelection && hasAny(VOLUME)) {
    return { intent: "top-selection", tool: "top-selection", params: { period: detectPeriod(qn, "today") } };
  }

  // 9) Rede de segurança: fraseados que falam de "selection ... mais ..." sem a
  //    palavra exata de volume, mas claramente a pedir a mais apostada.
  if (hasSelection && has("mais", "maior", "top") && has("aposta", "bet", "popular", "jogada")) {
    return { intent: "top-selection", tool: "top-selection", params: { period: detectPeriod(qn, "today") } };
  }

  return null;
}

/** A pergunta é do âmbito do agente de analytics? */
export function isAnalyticsIntent(question = "") {
  return routeAnalytics(question) !== null;
}

// ─── Reformulação via LLM: prompt + validação (anti-alucinação) ─────────────

/**
 * Prompt para o LLM reescrever a frase determinística. Curto e estrito: o LLM
 * NÃO calcula nada, apenas reescreve mantendo números e nomes exatos.
 */
export function buildAnalyticsPolishPrompt({ question, toolResult }) {
  return [
    "Reescreve a FRASE DE REFERÊNCIA numa resposta natural em Português europeu.",
    "Regras estritas:",
    "1) NÃO alteres nem inventes números, percentagens, nomes, odds ou datas — usa exatamente os da frase de referência.",
    "2) Responde apenas à PERGUNTA atual, em 1 a 2 frases.",
    "3) NUNCA escrevas 'User:', 'Assistant:', nem repitas o histórico ou outras perguntas.",
    "4) Não comeces por 'Nota:' nem acrescentes comentários de risco; dá apenas a resposta direta.",
    "5) Não menciones 'tool', 'JSON' nem detalhes internos.",
    "",
    `PERGUNTA: ${question}`,
    `FRASE DE REFERÊNCIA: ${toolResult.answer}`,
    "",
    "Resposta:",
  ].join("\n");
}

// Tokens numéricos de um texto (aceita 2,48 / 2.48 / 11 / 08 / 1440,93).
function numericTokens(text = "") {
  const out = new Set();
  const matches = String(text).match(/\d+(?:[.,]\d+)?/g) || [];
  for (const m of matches) {
    out.add(m);
    out.add(m.replace(",", "."));
    out.add(m.replace(".", ","));
  }
  return out;
}

// Nomes entre aspas na frase de referência (selection/evento/betType).
function quotedNames(text = "") {
  const out = [];
  const re = /"([^"]+)"/g;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    if (m[1] && m[1].trim()) out.push(m[1].trim());
  }
  return out;
}

// Deteta texto degenerado: poucas palavras únicas repetidas muitas vezes
// (sintoma típico de um modelo pequeno a "encravar" num loop).
function isDegenerate(text = "") {
  const words = String(text).toLowerCase().match(/[a-zà-ÿ]{2,}/gi) || [];
  if (words.length < 12) return false;
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  const unique = freq.size;
  // Diversidade lexical muito baixa → loop.
  if (unique / words.length < 0.35) return true;
  // Uma única palavra de conteúdo a dominar o texto.
  let maxRepeat = 0;
  for (const [w, n] of freq) {
    if (w.length >= 4 && n > maxRepeat) maxRepeat = n;
  }
  if (maxRepeat >= 6) return true;
  return false;
}

/**
 * Valida a reformulação do LLM contra a frase determinística. Rejeita se:
 *  - vazia, demasiado longa, ou com fuga de papéis ("User:"/"Assistant:");
 *  - começar por "Nota:"/"Resposta:"/"Pergunta:"/"Dados:" (eco do prompt);
 *  - texto degenerado (loop de repetição);
 *  - perdeu/alterou os números de referência (quando existem);
 *  - perdeu os nomes entre aspas de referência (quando existem).
 * Em qualquer rejeição, o orquestrador usa a frase determinística.
 */
export function validateAnalyticsPolish(polish, toolResult) {
  const text = String(polish || "").trim();
  if (!text) return false;
  if (text.length > 600) return false;

  if (/\buser\b\s*:|\bassistant\b\s*:/i.test(text)) return false;
  // Fugas de etiquetas do prompt (o 1B costuma ecoar "Resposta:"/"Pergunta:"/"Dados:").
  if (/^\s*(nota|resposta|pergunta|dados|frase de referencia|frase de referência)\s*:/im.test(text)) return false;
  if (/\{\s*"tool"/.test(text) || text.includes("```")) return false;
  // Degeneração por repetição (ex.: "and the matter, and the matter, ...").
  if (isDegenerate(text)) return false;

  const ref = String(toolResult?.answer || "");
  if (!ref) return false;

  // Números: pelo menos um número de referência tem de aparecer na reformulação.
  const refNums = numericTokens(ref);
  if (refNums.size > 0) {
    const polishNums = numericTokens(text);
    let ok = false;
    for (const n of refNums) {
      if (polishNums.has(n)) { ok = true; break; }
    }
    if (!ok) return false;
  }

  // Nomes entre aspas: pelo menos um tem de aparecer (sem aspas / sem acentos).
  const names = quotedNames(ref);
  if (names.length > 0) {
    const low = normalize(text);
    const ok = names.some((n) => low.includes(normalize(n)));
    if (!ok) return false;
  }

  return true;
}

// ─── Caminho de execução do agente ──────────────────────────────────────────

/**
 * Executa o agente de analytics. Determinístico por construção; se for fornecida
 * uma função `polish` (LLM, NÃO-streamed), tenta reformular — validando sempre o
 * resultado e caindo na frase determinística em caso de dúvida.
 *
 * @param {object}   args
 * @param {string}   args.question
 * @param {Array}    args.bets
 * @param {Function} [args.polish]  async ({question, toolResult}) => string|null
 * @param {Function} [args.emit]    (text) => void   (entrega final ao UI)
 * @returns {Promise<{handled:boolean, text?:string, route?:object}>}
 */
export async function answerAnalytics({ question, bets, polish, emit }) {
  const route = routeAnalytics(question);
  if (!route) return { handled: false };

  const toolResult = runTool(route.tool, bets, route.params);
  const deterministic =
    toolResult.answer ||
    "Não consegui obter dados suficientes para responder. Tenta reformular a pergunta.";

  let finalText = deterministic;

  // Só vale a pena reformular quando há dados concretos.
  if (typeof polish === "function" && toolResult.data) {
    try {
      const polished = await polish({ question, toolResult });
      if (polished && validateAnalyticsPolish(polished, toolResult)) {
        finalText = polished.trim();
      }
    } catch {
      /* mantém a frase determinística */
    }
  }

  if (typeof emit === "function") {
    try { emit(finalText); } catch { /* ignore */ }
  }

  return { handled: true, text: finalText, route };
}