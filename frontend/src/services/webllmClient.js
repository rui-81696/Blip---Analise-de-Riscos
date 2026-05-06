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

  const allowedIntents = new Set(["summary", "by-sport", "by-risk"]);
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

  return { intent: safeIntent, params };
}

export function fallbackIntent(question = "") {
  const normalized = question.toLowerCase();

  if (normalized.includes("risco") || normalized.includes("risk")) {
    return { intent: "by-risk", params: { period: DEFAULT_PERIOD } };
  }

  if (
    normalized.includes("desporto")
    || normalized.includes("esporte")
    || normalized.includes("sport")
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
    "Output schema: {\"intent\":\"summary|by-sport|by-risk\",\"params\":{\"period\":\"1h|24h|7d|today\",\"limit\":number?}}",
    "Rules:",
    "- summary for general overview questions",
    "- by-sport for questions grouped by sport",
    "- by-risk for risk distribution questions",
    "- use period=24h by default",
    "- include limit only for by-sport; default limit=10",
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

export async function resolveIntent(question) { //colocar aqui a receber as bets e fazer a resolucao dentro do frontend
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
      temperature: 0,
      max_tokens: 120,
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
