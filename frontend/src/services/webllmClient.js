/**
 * Cliente WebLLM (Llama-3.2) para o Risk Assistant.
 *
 * Arquitetura — function-calling em dois estágios:
 *   1) ROUTER:    LLM lê a pergunta + catálogo de tools e devolve JSON
 *                 { tool, params }. Não calcula nada.
 *   2) COMPOSER:  Aplicamos a tool localmente sobre os dados do frontend,
 *                 obtemos o resultado real, e pedimos ao LLM para formular
 *                 a resposta em PT‑PT usando esses dados como ground truth.
 *
 * Vantagens:
 *   - Zero pedidos ao backend (tudo client-side).
 *   - O LLM nunca inventa números — só fala sobre os que a tool calcular.
 *   - Para perguntas fora do domínio, há um modo "chit-chat" controlado.
 *   - Fallbacks robustos: se o LLM falhar, usamos um router heurístico
 *     muito leve só para o roteamento (a resposta usa sempre a tool real).
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

/**
 * Cria/retorna o engine. Disparado quando o utilizador abre o chat,
 * de modo que o load (~150–300 MB) não impacte o boot da app.
 */
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

function buildRouterPrompt(question, datasetContext) {
  const toolsList = buildToolsList();
  const ctx = datasetContext
    ? `Dataset disponível: ${datasetContext.totalBets} apostas. Sports: ${datasetContext.sports.slice(0, 8).join(", ")}. betTypes: ${datasetContext.betTypes.slice(0, 8).join(", ")}. Top selections: ${datasetContext.topSelections.slice(0, 5).map((s) => s.selection).join(", ")}. Top events: ${datasetContext.topEvents.slice(0, 5).map((e) => e.event).join(", ")}.`
    : "";

  return [
    "You are a tool router for a sports-betting risk assistant.",
    "Given a user question in Portuguese or English, pick exactly ONE tool from the catalog and the params it needs.",
    "Output STRICT JSON only, no prose, no markdown, no explanation. Schema:",
    '{"tool":"<tool-name>","params":{"period":"today|yesterday|1h|24h|7d|all","selection":"<text>?","event":"<text>?","sport":"<text>?","limit":<number>?}}',
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
    "- 'resumo geral' → summary.",
    "- When extracting 'selection', 'event', or 'sport' from the question, copy the literal text from the question, do not translate. Examples: 'na selection Draw' → selection='Draw'; 'no evento Benfica vs Porto' → event='Benfica vs Porto'; 'no sport Tennis' → sport='Tennis'.",
    "- If no tool fits cleanly, choose 'summary' with period=24h.",
    "",
    ctx,
    "",
    `Question: ${question}`,
    "JSON:",
  ].join("\n");
}

function buildComposerPrompt({ question, toolResult, history }) {
  const historyBlock = Array.isArray(history) && history.length > 0
    ? history
        .slice(-4)
        .map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`)
        .join("\n")
    : "(sem histórico)";

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
    `Resposta determinística (fallback caso o LLM falhe): ${toolResult.answer}`,
    `Dados da tool: ${toolData}`,
    "",
    "Resposta final:",
  ].join("\n");
}

function buildChitChatPrompt(question, history) {
  const historyBlock = Array.isArray(history) && history.length > 0
    ? history.slice(-4).map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.text}`).join("\n")
    : "(sem histórico)";

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

const VALID_PERIODS = new Set(["today", "yesterday", "1h", "24h", "7d", "all"]);

function normalizeRoute(parsed) {
  if (!parsed || typeof parsed !== "object") return null;

  const toolName = String(parsed.tool || "").trim();
  if (!TOOL_CATALOG[toolName]) return null;

  const rawParams = parsed.params && typeof parsed.params === "object" ? parsed.params : {};

  const params = {};
  if (rawParams.period && VALID_PERIODS.has(rawParams.period)) {
    params.period = rawParams.period;
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

// ─── Router heurístico (apenas fallback se LLM falhar no estágio 1) ────────

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

  // Tenta extrair "selection X", "evento Y", "sport Z" do texto bruto
  // (mantém a caixa original para correspondência). As stop-words limitam
  // a captura ao nome real (evita apanhar "X com base na última semana").
  const STOPS = /(?:\s+(?:com|para|na|no|nas|nos|de|do|da|das|dos|com base|baseado|baseada|baseando|durante|nas|últim|ultim)|[?.!,])/i;
  const extractAfter = (re) => {
    const match = String(question).match(re);
    if (!match) return null;
    const raw = match[1].trim();
    // Corta no primeiro stop-word/pontuação
    const stopMatch = raw.match(STOPS);
    const cleaned = stopMatch ? raw.slice(0, stopMatch.index) : raw;
    return cleaned.trim() || null;
  };

  const selection = extractAfter(/(?:selection|seleção|selecao)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,60}?)(?=[?.!,]|$)/i);
  const event = extractAfter(/(?:evento|event|jogo)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,80}?)(?=[?.!,]|$)/i);
  const sport = extractAfter(/(?:sport|desporto)\s+([A-Za-zÀ-ÿ0-9 ./-]{2,40}?)(?=[?.!,]|$)/i);

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
];

function isDomainQuestion(question = "") {
  const q = String(question).toLowerCase();
  return DOMAIN_KEYWORDS.some((k) => q.includes(k));
}

// ─── Estágio 1: routing ────────────────────────────────────────────────────

async function llmRoute(question, datasetContext) {
  const engine = await getEngine();
  if (!engine) return null;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: "You output ONLY valid JSON. No prose, no markdown." },
        { role: "user", content: buildRouterPrompt(question, datasetContext) },
      ],
      temperature: 0.1,
      max_tokens: 180,
    });
    const text = response?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(text);
    return normalizeRoute(parsed);
  } catch (error) {
    console.warn("[WebLLM] router falhou:", error);
    return null;
  }
}

// ─── Estágio 2: composição da resposta ─────────────────────────────────────

async function llmCompose({ question, toolResult, history }) {
  const engine = await getEngine();
  if (!engine) return null;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "És um assistant profissional de análise de risco em apostas desportivas. Falas em Português europeu. Respondes de forma curta e clara, baseando-te apenas nos dados fornecidos.",
        },
        { role: "user", content: buildComposerPrompt({ question, toolResult, history }) },
      ],
      temperature: 0.3,
      max_tokens: 220,
    });

    return (response?.choices?.[0]?.message?.content || "").trim();
  } catch (error) {
    console.warn("[WebLLM] composer falhou:", error);
    return null;
  }
}

async function llmChitChat(question, history) {
  const engine = await getEngine();
  if (!engine) return null;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "És o Risk Assistant da Blip. Falas em Português europeu de forma natural e curta.",
        },
        { role: "user", content: buildChitChatPrompt(question, history) },
      ],
      temperature: 0.5,
      max_tokens: 180,
    });

    return (response?.choices?.[0]?.message?.content || "").trim();
  } catch (error) {
    console.warn("[WebLLM] chit-chat falhou:", error);
    return null;
  }
}

// ─── API pública ───────────────────────────────────────────────────────────

/**
 * Resposta para perguntas fora do domínio (small talk, perguntas gerais).
 * Usado quando o utilizador escreve algo que não toca apostas/risco.
 */
async function handleGeneralQuestion(question, history) {
  // Atalho determinístico para aritmética trivial (ex.: "2+2"), sempre certo
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
    if (Number.isFinite(r)) return `${a} ${op} ${b} = ${r}.`;
  }

  if (currentStatus === "ready") {
    const reply = await llmChitChat(question, history);
    if (reply) return reply;
  }

  // Fallbacks simples
  const q = question.toLowerCase();
  if (q.includes("ola") || q.includes("olá") || q.includes("hello") || q.includes("boas") || q.includes("hey") || q.includes("hi")) {
    return "Olá! Sou o Risk Assistant. Pergunta-me sobre as apostas no dashboard — selections, betTypes, picos de atividade, exposição da casa, etc.";
  }
  if (q.includes("quem es") || q.includes("quem és") || q.includes("o que fazes") || q.includes("what are you")) {
    return "Sou um assistant client-side baseado em Llama (via WebLLM). Analiso os dados de apostas que estão no dashboard e ajudo a perceber risco, padrões e exposição.";
  }
  if (q.includes("obrigad") || q.includes("thanks") || q.includes("thank you")) {
    return "Sempre às ordens.";
  }

  if (currentStatus === "loading") {
    return `O modelo Llama ainda está a carregar (${Math.round((currentProgress || 0) * 100)}%). Posso responder a perguntas concretas sobre apostas; para conversa geral, espera só um pouco.`;
  }

  return "Posso ajudar com perguntas sobre as apostas no dashboard. Por exemplo: 'qual foi a selection com mais apostas ontem?' ou 'qual é a distribuição de bets por betType hoje?'";
}

/**
 * Função principal: o componente chama isto com a pergunta + as apostas
 * em memória + histórico recente. Devolve string final pronta a mostrar.
 */
export async function answerQuestion({ question, bets, history = [] }) {
  const cleanQuestion = String(question || "").trim();
  if (!cleanQuestion) return "";

  // 1) Perguntas claramente fora de domínio → conversational
  if (!isDomainQuestion(cleanQuestion)) {
    const reply = await handleGeneralQuestion(cleanQuestion, history);
    if (reply) return reply;
  }

  // 2) Routing — LLM se disponível, senão heurístico mínimo
  const datasetContext = describeDataset(bets);
  let route = null;
  if (currentStatus === "ready") {
    route = await llmRoute(cleanQuestion, datasetContext);
  }
  if (!route) {
    route = heuristicRoute(cleanQuestion);
  }

  // 3) Executar a tool (sempre determinístico, sobre os dados do frontend)
  const toolResult = runTool(route.tool, bets, route.params);

  // 4) Compor resposta final
  //    - Se o LLM estiver pronto, usamos para frasear naturalmente.
  //    - Caso contrário, devolvemos a resposta determinística da tool
  //      (que já é uma frase completa em PT-PT).
  if (currentStatus === "ready" && toolResult.answer) {
    const composed = await llmCompose({ question: cleanQuestion, toolResult, history });
    if (composed && composed.length > 0) {
      return composed;
    }
  }

  return toolResult.answer || "Não consegui obter dados suficientes para responder. Tenta reformular a pergunta.";
}

/**
 * Helper exposto: lista de exemplos de perguntas suportadas (para UI).
 */
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