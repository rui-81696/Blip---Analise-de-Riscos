/**
 * Cliente WebLLM (Llama-3.2) para o Risk Assistant.
 *
 * Arquitetura — function-calling em dois estágios + streaming:
 *   1) ROUTER:    LLM lê a pergunta + histórico recente (se ambíguo) +
 *                 catálogo de tools e devolve JSON {tool, params}.
 *   2) COMPOSER:  Aplicamos a tool localmente, obtemos o resultado real,
 *                 e pedimos ao LLM para frasear naturalmente — com STREAMING
 *                 token a token via callback onToken.
 *
 * Modos especiais:
 *   - answerQuestion()    → pipeline normal (router → tool → composer).
 *   - runRiskAnalysis()   → pipeline dedicado: tool detect-anomalies +
 *                           composer com prompt de "briefing operacional".
 */

import { CreateMLCEngine } from "@mlc-ai/web-llm";
import { runTool, TOOL_CATALOG, describeDataset } from "../utils/betsAnalytics";

const MODEL_ID = import.meta.env.VITE_WEBLLM_MODEL || "Llama-3.2-1B-Instruct-q4f32_1-MLC";

// ─── Estado do motor (singleton) ───────────────────────────────────────────

let enginePromise = null;
let currentStatus = "idle"; // idle | loading | ready | fallback
let currentProgress = 0;
const listeners = new Set();

function setStatus(status, progress = currentProgress) {
  currentStatus = status;
  currentProgress = progress;
  for (const fn of listeners) {
    fn({ status: currentStatus, progress: currentProgress, model: MODEL_ID });
  }
}

export function subscribeWebLLMStatus(listener) {
  listeners.add(listener);
  listener({ status: currentStatus, progress: currentProgress, model: MODEL_ID });
  return () => listeners.delete(listener);
}

export async function warmupWebLLM() {
  if (enginePromise) return enginePromise.catch(() => null);

  setStatus("loading", 0);

  enginePromise = CreateMLCEngine(MODEL_ID, {
    initProgressCallback: (report) => {
      const pct = Math.max(0, Math.min(1, Number(report?.progress) || 0));
      setStatus("loading", pct);
    },
  })
    .then((engine) => {
      setStatus("ready", 1);
      return engine;
    })
    .catch((error) => {
      setStatus("fallback", 0);
      enginePromise = null;
      console.error("[WebLLM] falha ao carregar engine:", error);
      throw error;
    });

  return enginePromise.catch(() => null);
}

async function getEngine() {
  if (!enginePromise) await warmupWebLLM();
  return enginePromise;
}

// ─── Multi-turn: deteta se a pergunta atual precisa de contexto anterior ──

const AMBIGUITY_MARKERS = [
  // PT
  "\\be\\b",          // "e hoje?", "e em football?"
  "\\bem vez\\b",
  "\\btambem\\b",
  "\\btambém\\b",
  "\\besse\\b", "\\bessa\\b", "\\bisso\\b",
  "\\beste\\b", "\\besta\\b", "\\bisto\\b",
  "\\bo mesmo\\b", "\\ba mesma\\b",
  "\\bagora\\b",
  "\\bcompara\\b", "\\bcomparado\\b",
  "\\bem vez disso\\b",
  // EN (caso o utilizador escreva em inglês)
  "\\band\\b", "\\bthat\\b", "\\bthis\\b", "\\bsame\\b", "\\binstead\\b",
];

function questionNeedsContext(question = "") {
  const normalized = String(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (normalized.length === 0) return false;
  // Mensagens curtas (≤ 4 palavras) são frequentemente continuações.
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount <= 4) return true;
  return AMBIGUITY_MARKERS.some((pat) => new RegExp(pat, "i").test(normalized));
}

function recentTurns(history, limit = 2) {
  if (!Array.isArray(history) || history.length === 0) return [];
  // Cada "turn" = um par user+assistant. limit=2 → últimas 2 trocas = 4 mensagens.
  const userMessages = history.filter((m) => m.role === "user" || m.role === "assistant");
  return userMessages.slice(-(limit * 2));
}

function formatHistory(turns) {
  if (turns.length === 0) return "(sem histórico)";
  return turns.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`).join("\n");
}

// ─── Prompts ───────────────────────────────────────────────────────────────

function buildToolsList() {
  return Object.entries(TOOL_CATALOG)
    .map(([name, spec]) => {
      const params = Object.entries(spec.params)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      return `  • ${name} — ${spec.description} [params: ${params || "none"}]`;
    })
    .join("\n");
}

function buildRouterPrompt(question, datasetContext, contextTurns) {
  const toolsList = buildToolsList();
  const ctx = datasetContext
    ? `Dataset: ${datasetContext.totalBets} apostas. Sports: ${datasetContext.sports.slice(0, 8).join(", ")}. betTypes: ${datasetContext.betTypes.slice(0, 8).join(", ")}. Top selections: ${datasetContext.topSelections.slice(0, 5).map((s) => s.selection).join(", ")}. Top events: ${datasetContext.topEvents.slice(0, 5).map((e) => e.event).join(", ")}.`
    : "";

  const historyBlock = contextTurns.length > 0
    ? `Recent conversation (use to resolve references like "e hoje?", "esse evento", "também"):\n${formatHistory(contextTurns)}\n`
    : "";

  return [
    "You are a tool router for a sports-betting risk assistant.",
    "Given a user question in Portuguese or English, pick exactly ONE tool from the catalog and the params it needs.",
    "Output STRICT JSON only, no prose, no markdown, no explanation. Schema:",
    '{"tool":"<tool-name>","params":{"period":"today|yesterday|1h|24h|7d|all","selection":"<text>?","event":"<text>?","sport":"<text>?","limit":<number>?,"periodA":"<period>?","periodB":"<period>?","metric":"<metric>?"}}',
    "",
    "Available tools:",
    toolsList,
    "",
    "Routing rules:",
    "- 'ontem' / 'yesterday' → period=yesterday. 'hoje' / 'today' → period=today. 'última semana' / 'last week' → period=7d. 'última hora' → period=1h. Default → period=24h.",
    "- 'selection que teve mais apostas' → top-selection.",
    "- 'odd mais usada na selection X' → selection-odd-mode, params.selection='X'.",
    "- 'quantas selections tem o evento X' → event-selection-count, params.event='X'.",
    "- 'média de odd para apostas na selection X' → selection-average-odd, params.selection='X'.",
    "- 'bet que mais pode dar prejuízo à casa' / 'maior exposição' → top-loss-bet.",
    "- 'distribuição por betType' → bettype-distribution.",
    "- 'quantas legs tem a bet com mais legs' → max-legs.",
    "- 'betType mais comum para apostas no sport X' → top-bettype-sport, params.sport='X'.",
    "- 'altura do dia / hora com mais apostas ontem' → peak-hour, period=yesterday.",
    "- 'altura do dia / hora com mais apostas no sport X' → peak-hour-sport, params.sport='X', period=7d.",
    "- 'comparar X vs Y', 'como está hoje vs ontem', 'esta semana vs semana passada' → compare-periods (set periodA and periodB; optional metric=betCount|totalStake|totalExposure|averageOdd).",
    "- 'alertas', 'anomalias', 'análise de risco', 'briefing', 'algum padrão suspeito' → detect-anomalies.",
    "- 'resumo geral' → summary.",
    "- When extracting 'selection', 'event', or 'sport' from the question, copy the literal text from the question, do not translate. Examples: 'na selection Draw' → selection='Draw'; 'no evento Benfica vs Porto' → event='Benfica vs Porto'; 'no sport Tennis' → sport='Tennis'.",
    "- If history is provided and the question references something earlier (e.g. starts with 'e ', 'também', 'agora'), inherit the previous tool's params (sport/event/selection) and adjust only what changed.",
    "- If no tool fits cleanly, choose 'summary' with period=24h.",
    "",
    historyBlock,
    ctx,
    "",
    `Question: ${question}`,
    "JSON:",
  ].join("\n");
}

function buildComposerPrompt({ question, toolResult, history }) {
  const historyBlock = formatHistory(recentTurns(history, 2));
  const toolData = toolResult.data ? JSON.stringify(toolResult.data) : "null";

  return [
    "És um assistant profissional de análise de risco em apostas desportivas.",
    "Respondes SEMPRE em Português europeu, de forma clara, natural e curta (1 a 4 frases).",
    "",
    "REGRAS CRÍTICAS:",
    "1) Os números/valores/nomes vêm do bloco 'Dados da tool'. Não inventes nem alteres valores.",
    "2) Se 'Dados da tool' indicar erro ou ausência de dados, comunica isso com clareza — não inventes alternativas.",
    "3) Não menciones 'tool', 'JSON', 'WebLLM' ou detalhes internos. Fala como um analista humano.",
    "4) Quando útil, acrescenta uma micro-recomendação (1 frase) só se for óbvia a partir dos dados — caso contrário, não acrescentes nada.",
    "",
    `Histórico recente:\n${historyBlock}`,
    "",
    `Pergunta do utilizador: ${question}`,
    `Tool executada: ${toolResult.tool}`,
    `Resposta determinística (fallback): ${toolResult.answer}`,
    `Dados da tool: ${toolData}`,
    "",
    "Resposta final:",
  ].join("\n");
}

function buildRiskBriefingPrompt({ toolResult }) {
  const anomalies = toolResult.data?.anomalies || [];
  return [
    "És o analista de risco da Blip. Vais compor um briefing operacional curto para a equipa que opera o livro.",
    "Português europeu. Tom: profissional, factual, sem dramatismo, sem floreados.",
    "",
    "FORMATO (segue à risca):",
    "- 1ª linha: avaliação geral em 1 frase ('Operação estável.' / 'Atenção pontual.' / 'Vários alertas em simultâneo — recomenda-se revisão imediata.').",
    "- A seguir: bullets, um por alerta, na ordem em que vêm. Cada bullet começa com [SEVERIDADE] e descreve o alerta + 1 ação concreta sugerida (ex.: 'reduzir limite', 'pausar mercado', 'rever liability').",
    "- NÃO inventes alertas; usa só os que estão nos dados.",
    "- Se a lista vier vazia: responde apenas 'Sem padrões anómalos detetados.' e nada mais.",
    "",
    `Dados (lista de anomalias detetadas):\n${JSON.stringify(anomalies, null, 2)}`,
    "",
    "Briefing:",
  ].join("\n");
}

function buildChitChatPrompt(question, history) {
  const historyBlock = formatHistory(recentTurns(history, 2));
  return [
    "És o Risk Assistant da Blip, integrado num dashboard de análise de risco para casas de apostas.",
    "Respondes em Português europeu, de forma natural, simpática e profissional. Mantém respostas curtas (1–4 frases).",
    "Se a pergunta não tiver relação com apostas/risco, podes conversar normalmente, mas se for adequado lembra o utilizador que também consegues analisar os dados de apostas que estão no dashboard.",
    "Nunca inventes números sobre apostas — para isso o utilizador deve fazer uma pergunta concreta.",
    "",
    `Histórico recente:\n${historyBlock}`,
    "",
    `Pergunta: ${question}`,
    "Resposta:",
  ].join("\n");
}

// ─── Parsing helpers ───────────────────────────────────────────────────────

function safeJsonParse(rawText) {
  if (!rawText) return null;
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

const VALID_PERIODS = new Set(["today", "yesterday", "1h", "24h", "7d", "14d", "all"]);
const VALID_METRICS = new Set(["betCount", "totalStake", "totalExposure", "averageOdd"]);

function normalizeRoute(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const toolName = String(parsed.tool || "").trim();
  if (!TOOL_CATALOG[toolName]) return null;

  const rawParams = parsed.params && typeof parsed.params === "object" ? parsed.params : {};

  const params = {};
  if (rawParams.period && VALID_PERIODS.has(rawParams.period)) {
    params.period = rawParams.period;
  }
  if (rawParams.periodA && VALID_PERIODS.has(rawParams.periodA)) {
    params.periodA = rawParams.periodA;
  }
  if (rawParams.periodB && VALID_PERIODS.has(rawParams.periodB)) {
    params.periodB = rawParams.periodB;
  }
  if (rawParams.metric && VALID_METRICS.has(rawParams.metric)) {
    params.metric = rawParams.metric;
  }
  if (typeof rawParams.selection === "string" && rawParams.selection.trim()) {
    params.selection = rawParams.selection.trim();
  }
  if (typeof rawParams.event === "string" && rawParams.event.trim()) {
    params.event = rawParams.event.trim();
  }
  if (typeof rawParams.sport === "string" && rawParams.sport.trim()) {
    params.sport = rawParams.sport.trim();
  }
  if (Number.isFinite(Number(rawParams.limit))) {
    params.limit = Math.min(Math.max(Number(rawParams.limit), 1), 20);
  }

  return { tool: toolName, params };
}

// ─── Router heurístico (fallback) ─────────────────────────────────────────

function heuristicRoute(question = "") {
  const q = String(question)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const period = q.includes("ontem") || q.includes("yesterday")
    ? "yesterday"
    : q.includes("hoje") || q.includes("today")
      ? "today"
      : q.includes("ultima semana") || q.includes("semana passada") || q.includes("last week") || q.includes("7 dias")
        ? "7d"
        : q.includes("ultima hora") || q.includes("last hour")
          ? "1h"
          : "24h";

  const STOPS = /(?:\s+(?:com|para|na|no|nas|nos|de|do|da|das|dos|com base|baseado|baseada|baseando|durante|últim|ultim)|[?.!,])/i;
  const extractAfter = (re) => {
    const match = String(question).match(re);
    if (!match) return null;
    const raw = match[1].trim();
    const stopMatch = raw.match(STOPS);
    const cleaned = stopMatch ? raw.slice(0, stopMatch.index) : raw;
    return cleaned.trim() || null;
  };

  const selection = extractAfter(/(?:selection|seleção|selecao)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,60}?)(?=[?.!,]|$)/i);
  const event = extractAfter(/(?:evento|event|jogo)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,80}?)(?=[?.!,]|$)/i);
  const sport = extractAfter(/(?:sport|desporto)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,40}?)(?=[?.!,]|$)/i);

  if (q.includes("anomali") || q.includes("alerta") || q.includes("padrao suspeito") || q.includes("padrão suspeito") || q.includes("briefing") || q.includes("analise de risco") || q.includes("análise de risco")) {
    return { tool: "detect-anomalies", params: {} };
  }

  if (q.includes("compar") || q.includes("vs") || (q.includes("hoje") && q.includes("ontem"))) {
    const periodA = q.includes("hoje") ? "today" : "24h";
    const periodB = q.includes("ontem") ? "yesterday" : q.includes("semana passada") || q.includes("ultima semana") ? "7d" : "yesterday";
    return { tool: "compare-periods", params: { periodA, periodB } };
  }

  if (q.includes("selection") || q.includes("seleção") || q.includes("selecao")) {
    if (q.includes("odd mais usada") || q.includes("odd mais frequente") || q.includes("moda")) {
      return { tool: "selection-odd-mode", params: { period, ...(selection && { selection }) } };
    }
    if (q.includes("media de odd") || q.includes("odd media") || q.includes("média de odd")) {
      return { tool: "selection-average-odd", params: { period, ...(selection && { selection }) } };
    }
    if (q.includes("mais apostas") || q.includes("mais apostada")) {
      return { tool: "top-selection", params: { period } };
    }
  }

  if ((q.includes("evento") || q.includes("event")) && (q.includes("quantas selections") || q.includes("numero de selections"))) {
    return { tool: "event-selection-count", params: { period: "all", ...(event && { event }) } };
  }

  if (q.includes("prejuizo") || q.includes("perda max") || q.includes("maior perda") || q.includes("maior exposicao") || q.includes("exposição") || q.includes("dar prejuizo")) {
    return { tool: "top-loss-bet", params: { period } };
  }

  if (q.includes("distribuicao") && (q.includes("bettype") || q.includes("bet type") || q.includes("tipo"))) {
    return { tool: "bettype-distribution", params: { period: q.includes("ontem") ? "yesterday" : "today" } };
  }

  if (q.includes("legs")) {
    return { tool: "max-legs", params: { period: "all" } };
  }

  if ((q.includes("bettype") || q.includes("bet type") || q.includes("mercado") || q.includes("tipo de aposta")) && q.includes("mais comum")) {
    if (sport) return { tool: "top-bettype-sport", params: { period, sport } };
    return { tool: "bettype-top", params: { period } };
  }

  if (q.includes("altura do dia") || q.includes("hora do dia") || q.includes("pico de apostas") || q.includes("pico de bets")) {
    if (sport || q.includes("sport") || q.includes("desporto")) {
      return { tool: "peak-hour-sport", params: { period: "7d", ...(sport && { sport }) } };
    }
    return { tool: "peak-hour", params: { period: "yesterday" } };
  }

  if (q.includes("maior stake") || q.includes("mais stake")) {
    return { tool: "top-stake", params: { period } };
  }

  if (q.includes("ultim") || q.includes("recent")) {
    return { tool: "recent", params: { period, limit: 5 } };
  }

  if (q.includes("risco") || q.includes("risk")) {
    return { tool: "by-risk", params: { period } };
  }

  if (q.includes("desporto") || q.includes("sport") || q.includes("por desporto")) {
    return { tool: "by-sport", params: { period } };
  }

  return { tool: "summary", params: { period } };
}

// ─── Deteção de conversa fora do domínio ──────────────────────────────────

const DOMAIN_KEYWORDS = [
  "aposta", "apostas", "bet", "bets", "stake", "odd", "odds",
  "risco", "risk", "prejuizo", "prejuízo", "perda", "exposicao", "exposição",
  "desporto", "esporte", "sport", "evento", "event", "selection", "seleção", "selecao",
  "bettype", "bet type", "mercado", "legs", "leg", "casa", "house",
  "football", "futebol", "basket", "basketball", "tennis", "tenis", "tênis",
  "resumo", "summary", "overview", "hora", "altura", "pico",
  "anomali", "alerta", "briefing", "padrao", "padrão", "comparar", "vs",
];

function isDomainQuestion(question = "") {
  const q = String(question).toLowerCase();
  return DOMAIN_KEYWORDS.some((k) => q.includes(k));
}

// ─── Estágio 1: routing ────────────────────────────────────────────────────

async function llmRoute(question, datasetContext, contextTurns) {
  const engine = await getEngine();
  if (!engine) return null;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "You output ONLY valid JSON. No prose, no markdown." },
        { role: "user", content: buildRouterPrompt(question, datasetContext, contextTurns) },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });
    const text = response?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);
    return normalizeRoute(parsed);
  } catch (error) {
    console.warn("[WebLLM] router falhou:", error);
    return null;
  }
}

// ─── Estágio 2: composição da resposta (com STREAMING) ─────────────────────

async function llmComposeStreamed({ question, toolResult, history, onToken, promptBuilder }) {
  const engine = await getEngine();
  if (!engine) return null;

  const builder = promptBuilder || buildComposerPrompt;

  try {
    const stream = await engine.chat.completions.create({
      stream: true,
      messages: [
        {
          role: "system",
          content: "És um assistant profissional de análise de risco em apostas desportivas. Falas em Português europeu. Respondes de forma curta e clara, baseando-te apenas nos dados fornecidos.",
        },
        { role: "user", content: builder({ question, toolResult, history }) },
      ],
      temperature: 0.3,
      max_tokens: 260,
    });

    let full = "";
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta) {
        full += delta;
        if (typeof onToken === "function") {
          try { onToken(delta); } catch { /* swallow consumer errors */ }
        }
      }
    }
    return full.trim();
  } catch (error) {
    console.warn("[WebLLM] composer streamed falhou:", error);
    return null;
  }
}

async function llmChitChatStreamed(question, history, onToken) {
  const engine = await getEngine();
  if (!engine) return null;

  try {
    const stream = await engine.chat.completions.create({
      stream: true,
      messages: [
        { role: "system", content: "És o Risk Assistant da Blip. Falas em Português europeu de forma natural e curta." },
        { role: "user", content: buildChitChatPrompt(question, history) },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    let full = "";
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta) {
        full += delta;
        if (typeof onToken === "function") {
          try { onToken(delta); } catch { /* ignore */ }
        }
      }
    }
    return full.trim();
  } catch (error) {
    console.warn("[WebLLM] chit-chat streamed falhou:", error);
    return null;
  }
}

// ─── Emissão sintética de "stream" para o caminho determinístico ───────────
// Garante que o componente nunca precisa de tratar dois caminhos diferentes:
// quando o LLM não está disponível, emitimos a string inteira como um único token.
function emitDeterministic(text, onToken) {
  if (typeof onToken === "function" && text) {
    try { onToken(text); } catch { /* ignore */ }
  }
  return text;
}

// ─── API pública ───────────────────────────────────────────────────────────

async function handleGeneralQuestion(question, history, onToken) {
  // Aritmética trivial — sempre determinística
  const mathMatch = String(question).trim().match(/^\s*(-?\d+(?:[.,]\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:[.,]\d+)?)\s*\?*\s*$/);
  if (mathMatch) {
    const a = Number(mathMatch[1].replace(",", "."));
    const op = mathMatch[2];
    const b = Number(mathMatch[3].replace(",", "."));
    let r = null;
    if (op === "+") r = a + b;
    if (op === "-") r = a - b;
    if (op === "*" || op === "x" || op === "×") r = a * b;
    if (op === "/") r = b === 0 ? null : a / b;
    if (Number.isFinite(r)) return emitDeterministic(`${a} ${op} ${b} = ${r}.`, onToken);
  }

  if (currentStatus === "ready") {
    const reply = await llmChitChatStreamed(question, history, onToken);
    if (reply) return reply;
  }

  const q = question.toLowerCase();
  if (q.includes("ola") || q.includes("olá") || q.includes("hello") || q.includes("boas") || q.includes("hey") || q.includes("hi")) {
    return emitDeterministic("Olá! Sou o Risk Assistant. Pergunta-me sobre as apostas no dashboard — selections, betTypes, picos de atividade, exposição da casa, etc.", onToken);
  }
  if (q.includes("quem es") || q.includes("quem és") || q.includes("o que fazes") || q.includes("what are you")) {
    return emitDeterministic("Sou um assistant client-side baseado em Llama (via WebLLM). Analiso os dados de apostas que estão no dashboard e ajudo a perceber risco, padrões e exposição.", onToken);
  }
  if (q.includes("obrigad") || q.includes("thanks") || q.includes("thank you")) {
    return emitDeterministic("Sempre às ordens.", onToken);
  }

  if (currentStatus === "loading") {
    return emitDeterministic(`O modelo Llama ainda está a carregar (${Math.round((currentProgress || 0) * 100)}%). Posso responder a perguntas concretas sobre apostas; para conversa geral, espera só um pouco.`, onToken);
  }

  return emitDeterministic("Posso ajudar com perguntas sobre as apostas no dashboard. Por exemplo: 'qual foi a selection com mais apostas ontem?' ou 'qual é a distribuição de bets por betType hoje?'", onToken);
}

/**
 * Função principal: o componente chama isto com a pergunta + as apostas
 * em memória + histórico recente + onToken.
 *
 * onToken: opcional. Se fornecido, é chamado com cada delta à medida que
 * o LLM produz tokens. No caminho determinístico, é chamado uma vez com
 * a string completa — o componente não precisa de saber a diferença.
 */
export async function answerQuestion({ question, bets, history = [], onToken }) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) return "";

  // 1) Perguntas fora de domínio → conversational
  if (!isDomainQuestion(cleanQuestion)) {
    return await handleGeneralQuestion(cleanQuestion, history, onToken);
  }

  // 2) Routing — multi-turn só quando faz sentido
  const datasetContext = describeDataset(bets);
  const contextTurns = questionNeedsContext(cleanQuestion) ? recentTurns(history, 2) : [];

  let route = null;
  if (currentStatus === "ready") {
    route = await llmRoute(cleanQuestion, datasetContext, contextTurns);
  }
  if (!route) {
    route = heuristicRoute(cleanQuestion);
  }

  // 3) Executar a tool
  const toolResult = runTool(route.tool, bets, route.params);

  // 4) Compor resposta
  if (currentStatus === "ready" && toolResult.answer) {
    const composed = await llmComposeStreamed({
      question: cleanQuestion,
      toolResult,
      history,
      onToken,
    });
    if (composed && composed.length > 0) return composed;
  }

  return emitDeterministic(
    toolResult.answer || "Não consegui obter dados suficientes para responder. Tenta reformular a pergunta.",
    onToken,
  );
}

/**
 * Modo dedicado: Análise de Risco / briefing operacional.
 * Corre detect-anomalies e usa um prompt diferente do composer normal,
 * focado em produzir um briefing curto com ações sugeridas.
 */
export async function runRiskAnalysis({ bets, history = [], onToken }) {
  const toolResult = runTool("detect-anomalies", bets, {});

  if (currentStatus === "ready") {
    const composed = await llmComposeStreamed({
      question: "Análise de risco — gera o briefing operacional.",
      toolResult,
      history,
      onToken,
      promptBuilder: buildRiskBriefingPrompt,
    });
    if (composed && composed.length > 0) return composed;
  }

  return emitDeterministic(toolResult.answer, onToken);
}

export const SUPPORTED_QUESTIONS = [
  "Qual foi a selection que teve mais apostas ontem?",
  "Qual foi a odd mais usada nas apostas para a selection Draw?",
  "Quantas selections tem o evento Benfica vs Porto?",
  "Qual é a média de odd para apostas na selection Yes?",
  "Qual foi a bet que mais pode dar prejuízo à casa?",
  "Qual é a distribuição de bets por betType hoje?",
  "Quantas legs tem a bet com mais legs?",
  "Qual é o betType mais comum para apostas no sport Tennis?",
  "Qual foi a altura do dia de ontem que tivemos um maior número de apostas?",
  "Qual a altura do dia que temos mais apostas para o sport Football com base na última semana?",
];