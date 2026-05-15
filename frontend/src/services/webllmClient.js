import { CreateMLCEngine } from "@mlc-ai/web-llm";

const MODEL_ID = import.meta.env.VITE_WEBLLM_MODEL || "Llama-3.2-1B-Instruct-q4f32_1-MLC";
const DEFAULT_PERIOD = "24h";

let enginePromise = null;
let currentStatus = "idle";
let currentProgress = 0;
const statusListeners = new Set();

function notifyStatus() {
  for (const listener of statusListeners) {
    listener({ status: currentStatus, progress: currentProgress, model: MODEL_ID });
  }
}

function setStatus(status, progress = currentProgress) {
  currentStatus = status;
  currentProgress = progress;
  notifyStatus();
}

function safeJsonParse(rawText) {
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeIntentPayload(payload) {
  const intent = String(payload?.intent || "summary");

  const allowedIntents = new Set(["summary", "by-sport", "by-risk", "recent", "top-stake", "critical"]);
  const safeIntent = allowedIntents.has(intent) ? intent : "summary";

  const params = {
    period: ["1h", "24h", "7d", "today"].includes(payload?.params?.period)
      ? payload.params.period
      : DEFAULT_PERIOD,
  };

  if (safeIntent === "by-sport") {
    const parsedLimit = Number(payload?.params?.limit);
    if (Number.isFinite(parsedLimit)) {
      params.limit = Math.min(Math.max(parsedLimit, 1), 1000);
    } else {
      params.limit = 10;
    }
  }

  if (safeIntent === "critical") {
    return { intent: "by-risk", params: { ...params, focus: "critical" } };
  }

  return { intent: safeIntent, params };
}

export function fallbackIntent(question = "") {
  const normalized = question.toLowerCase();

  if (normalized.includes("últim") || normalized.includes("ultim") || normalized.includes("recent")) {
    return { intent: "recent", params: { period: DEFAULT_PERIOD, limit: 5 } };
  }

  if (normalized.includes("maior stake") || normalized.includes("highest stake") || normalized.includes("top stake")) {
    return { intent: "top-stake", params: { period: DEFAULT_PERIOD, limit: 5 } };
  }

  if (normalized.includes("risco") || normalized.includes("risk")) {
    if (normalized.includes("critic")) {
      return { intent: "by-risk", params: { period: DEFAULT_PERIOD, focus: "critical" } };
    }
    return { intent: "by-risk", params: { period: DEFAULT_PERIOD } };
  }

  if (
    normalized.includes("desporto")
    || normalized.includes("esporte")
    || normalized.includes("sport")
    || normalized.includes("football")
    || normalized.includes("footabll")
    || normalized.includes("futebol")
    || normalized.includes("basket")
    || normalized.includes("basketball")
    || normalized.includes("basquet")
    || normalized.includes("basquetebol")
    || normalized.includes("tennis")
    || normalized.includes("tenis")
    || normalized.includes("por desporto")
  ) {
    return { intent: "by-sport", params: { period: DEFAULT_PERIOD, limit: 10 } };
  }

  return { intent: "summary", params: { period: DEFAULT_PERIOD } };
}

function buildSystemPrompt() {
  return [
    "You classify user questions about betting risk analytics.",
    "Return JSON only, no markdown.",
    "Output schema: {\"intent\":\"summary|by-sport|by-risk|recent|top-stake|critical\",\"params\":{\"period\":\"1h|24h|7d|today\",\"limit\":number?,\"focus\":\"critical\"?}}",
    "Rules:",
    "- summary for general overview questions",
    "- by-sport for questions grouped by sport or specific sport names",
    "- by-risk for risk distribution questions",
    "- recent for latest bets questions",
    "- top-stake for largest bets questions",
    "- critical for critical risk questions",
    "- use period=24h by default",
    "- When the user asks for analysis of the DATA provided in the prompt, DO NOT refuse: answer using the provided data and aggregates.",
    "- Only refuse when the user explicitly requests instructions to commit illegal acts, or requests private personally-identifiable information not present in the dataset.",
  ].join("\n");
}

function isRiskDomainQuestion(question = "") {
  const normalized = String(question).toLowerCase();
  const keywords = [
    "aposta",
    "apostas",
    "stake",
    "odd",
    "risco",
    "risk",
    "exposicao",
    "exposição",
    "desporto",
    "sport",
    "evento",
    "event",
    "selection",
    "selecao",
    "seleção",
    "football",
    "futebol",
    "basket",
    "basketball",
    "tennis",
    "tenis",
  ];

  return keywords.some((keyword) => normalized.includes(keyword));
}

function buildAnswerPrompt({ question, intent, params, analytics, conversation = [] }) {
  const { summary, sports, topEvents, topSelections, riskBuckets, recentBets } = analytics;
  const domainQuestion = isRiskDomainQuestion(question);

  let data = `Total ${summary.totalBets} apostas, stake €${summary.totalStake.toFixed(2)}, exposição €${summary.totalExposure.toFixed(2)}.`;

  if (sports && sports.length > 0) {
    data += " Desportos: " + sports.map((s) => `${s.sport}=${s.betCount}`).join(", ");
  }

  if (topEvents?.length) {
    data += " Eventos: " + topEvents
      .slice(0, 4)
      .map((item) => `${item.event}=${item.betCount}`)
      .join(", ");
  }

  if (topSelections?.length) {
    data += " Seleções: " + topSelections
      .slice(0, 4)
      .map((item) => `${item.selection}=${item.betCount}`)
      .join(", ");
  }

  if (riskBuckets) {
    data += ` Risco: baixo=${riskBuckets.low.count}, médio=${riskBuckets.medium.count}, alto=${riskBuckets.high.count}, crítico=${riskBuckets.critical.count}.`;
  }

  if (recentBets?.length) {
    data += " Recentes: " + recentBets
      .slice(0, 3)
      .map((b) => `${b.sport}-${b.selection}-€${Number(b.stake).toFixed(2)}`)
      .join(" | ");
  }

  if (riskBuckets?.critical?.count === 0) {
    data += " Nota: risco crítico está em 0 porque nenhuma aposta atual ultrapassa o limiar de risco crítico.";
  }

  const historyText = Array.isArray(conversation) && conversation.length > 0
    ? conversation
      .slice(-4)
      .map((item) => `${item.role === "assistant" ? "Assistant" : "User"}: ${item.text}`)
      .join("\n")
    : "Sem histórico.";

  const baseInstructions = [
    "És um assistant conversacional profissional.",
    "Responde em Português europeu, de forma clara, natural e útil.",
    "Se a pergunta for uma análise dos 'Dados' fornecidos, responde diretamente com os números/insights: NÃO recuses esse pedido.",
    "Evita respostas vagas: se a pergunta for ambígua, explica o que assumiste em 1 frase.",
    "Mantém respostas curtas (3 a 8 linhas), salvo pedido explícito do utilizador.",
    `Histórico recente:\n${historyText}`,
    `Pergunta: ${question}`,
  ];

  if (!domainQuestion) {
    return [
      ...baseInstructions,
      "A pergunta está fora do domínio de apostas. Responde como chat geral, sem inventar factos.",
    ].join("\n");
  }

  return [
    ...baseInstructions,
    "A pergunta está no domínio de apostas/risco.",
    `Intenção: ${intent}.`,
    `Parâmetros: ${JSON.stringify(params || {})}.`,
    `Dados: ${data}`,
    "Usa os dados acima quando o utilizador pedir números, totais ou comparações.",
  ].join("\n");
}

async function getEngine() {
  if (!enginePromise) {
    setStatus("loading", 0);

    enginePromise = CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        const pct = Math.max(0, Math.min(1, Number(progress?.progress || 0)));
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
        throw error;
      });
  }

  return enginePromise;
}

export async function warmupWebLLM() {
  try {
    await getEngine();
    return true;
  } catch {
    return false;
  }
}

export function subscribeWebLLMStatus(listener) {
  statusListeners.add(listener);
  listener({ status: currentStatus, progress: currentProgress, model: MODEL_ID });

  return () => {
    statusListeners.delete(listener);
  };
}

export async function resolveIntent(question) {
  const cleanQuestion = String(question || "").trim();

  if (!cleanQuestion) {
    return fallbackIntent("");
  }

  try {
    const engine = await getEngine();

    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: cleanQuestion },
      ],
      temperature: 0.2,
      max_tokens: 150,
    });

    const modelText = response?.choices?.[0]?.message?.content || "";
    const parsed = safeJsonParse(modelText);

    if (!parsed) {
      return fallbackIntent(cleanQuestion);
    }

    return normalizeIntentPayload(parsed);
  } catch {
    return fallbackIntent(cleanQuestion);
  }
}

export async function generateAssistantReply({ question, intent, params, analytics, conversation }) {
  try {
    const engine = await getEngine();

    const response = await engine.chat.completions.create({
      messages: [
        { role: "system", content: buildAnswerPrompt({ question, intent, params, analytics, conversation }) },
        { role: "user", content: question },
      ],
      temperature: 0.2,
      max_tokens: 220,
    });

    const reply = response?.choices?.[0]?.message?.content?.trim() || "";
    return reply.length > 0 ? reply : "";
  } catch {
    return "";
  }
}
