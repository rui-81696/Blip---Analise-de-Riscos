import { useEffect, useMemo, useState } from "react";
import {
  buildAssistantContext,
  buildDeterministicReply,
  computeAssistantAnalytics,
  formatAssistantReply,
} from "../utils/betsAnalytics";
import { loadStoredBets } from "../utils/betsStore";
import "./AssistantChat.scss";
const HISTORY_PREVIEW_LIMIT = 3;

/**
 * Lightweight fallback parser for immediate use before WebLLM loads
 */
function quickParseIntent(question = "") {
  const normalized = question.toLowerCase();

  if (
    normalized.includes("base de dados")
    || normalized.includes("tabela")
    || normalized.includes("registos")
    || normalized.includes("dados")
    || normalized.includes("database")
  ) {
    return { intent: "summary", params: { period: "24h" } };
  }

  if (normalized.includes("risco") || normalized.includes("risk")) {
    return { intent: "by-risk", params: { period: "24h" } };
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
    || normalized.includes("tennis")
    || normalized.includes("tenis")
    || normalized.includes("por desporto")
  ) {
    return { intent: "by-sport", params: { period: "24h", limit: 10 } };
  }

  return { intent: "summary", params: { period: "24h" } };
}

function buildQuickActionPayload(type) {
  if (type === "by-sport") {
    return {
      question: "Mostra por desporto",
      intent: "by-sport",
      params: { period: "24h", limit: 10 },
    };
  }

  if (type === "by-risk") {
    return {
      question: "Mostra por risco",
      intent: "by-risk",
      params: { period: "24h" },
    };
  }

  if (type === "top-sports") {
    return { question: "Top desportos", intent: "by-sport", params: { period: "24h", limit: 5 } };
  }

  if (type === "recent") {
    return { question: "Últimas apostas", intent: "recent", params: { limit: 5 } };
  }

  if (type === "critical") {
    return { question: "Risco crítico", intent: "by-risk", params: { period: "24h", focus: "critical" } };
  }

  if (type === "top-stake") {
    return { question: "Maior stake", intent: "top-stake", params: { limit: 5 } };
  }

  return {
    question: "Dá-me um resumo geral",
    intent: "summary",
    params: { period: "24h" },
  };
}

function withTimeout(promise, ms) {
  let id;
  const timeout = new Promise((resolve) => {
    id = setTimeout(() => resolve(null), ms);
  });

  return Promise.race([promise.finally(() => clearTimeout(id)), timeout]);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildRecentConversation(messages, limit = 6) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [];
  }

  return messages
    .slice(-limit)
    .filter((item) => item?.role === "user" || item?.role === "assistant")
    .map((item) => ({ role: item.role, text: item.text }));
}

function isGeneralConversationQuestion(question = "") {
  const normalized = question.toLowerCase();
  const domainKeywords = [
    "aposta",
    "apostas",
    "stake",
    "odd",
    "risco",
    "exposicao",
    "exposição",
    "desporto",
    "sport",
    "event",
    "evento",
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

  return !domainKeywords.some((keyword) => normalized.includes(keyword));
}

function buildGeneralConversationFallback(question) {
  const normalized = question.toLowerCase();

  const mathMatch = normalized.match(/^\s*(-?\d+(?:[.,]\d+)?)\s*([+\-*/x×])\s*(-?\d+(?:[.,]\d+)?)\s*\?*\s*$/);
  if (mathMatch) {
    const left = Number(String(mathMatch[1]).replace(",", "."));
    const operator = mathMatch[2];
    const right = Number(String(mathMatch[3]).replace(",", "."));
    let result = null;

    if (operator === "+") result = left + right;
    if (operator === "-") result = left - right;
    if (operator === "*" || operator === "x" || operator === "×") result = left * right;
    if (operator === "/") result = right === 0 ? null : left / right;

    if (Number.isFinite(result)) {
      return `O resultado é ${result}.`;
    }
  }

  if (normalized.includes("ola") || normalized.includes("olá") || normalized.includes("hello") || normalized.includes("boas")) {
    return "Olá! Posso conversar contigo normalmente e também analisar risco/apostas quando quiseres.";
  }

  if (normalized.includes("quem es") || normalized.includes("quem és") || normalized.includes("what are you")) {
    return "Sou o teu assistant no frontend. Posso conversar em linguagem natural e, quando pedires, cruzar isso com os dados locais de apostas.";
  }

  return "";
}

function buildGeneralLoadingFallback() {
  return "O WebLLM ainda está a carregar. Já consigo ajudar com perguntas sobre apostas/risco e, quando o modelo terminar de carregar, respondo também a qualquer tema em modo conversacional.";
}

export default function AssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [llmState, setLlmState] = useState({ status: "idle", progress: 0, model: "" });
  const [webllmLoaded, setWebllmLoaded] = useState(false);
  const [webllmFunctions, setWebllmFunctions] = useState(null);

  const visibleMessages = useMemo(() => {
    if (isExpanded) {
      return messages;
    }

    return messages.slice(-HISTORY_PREVIEW_LIMIT);
  }, [isExpanded, messages]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "m") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /**
   * Dynamically import WebLLM module only when assistant opens
   */
  useEffect(() => {
    if (!isOpen || webllmLoaded) {
      return;
    }

    setLlmState({ status: "loading", progress: 0, model: "Carregando..." });

    import("../services/webllmClient")
      .then((module) => {
        setWebllmFunctions(module);
        setWebllmLoaded(true);

        // Subscribe to status updates
        const unsubscribe = module.subscribeWebLLMStatus((payload) => {
          setLlmState(payload);
        });

        // Warmup the model
        module.warmupWebLLM();

        return unsubscribe;
      })
      .catch((error) => {
        console.error("Falha ao carregar WebLLM:", error);
        setLlmState({ status: "fallback", progress: 1, model: "Fallback" });
        setWebllmLoaded(true);
      });
  }, [isOpen, webllmLoaded]);

  /**
   * Legacy subscription effect (kept for backward compatibility)
   * Real subscription now happens in dynamic import above
   */
  useEffect(() => {
    if (!webllmLoaded || !webllmFunctions) {
      return;
    }

    const unsubscribe = webllmFunctions.subscribeWebLLMStatus((payload) => {
      setLlmState(payload);
    });

    return unsubscribe;
  }, [webllmLoaded, webllmFunctions]);

  useEffect(() => {
    if (isOpen && webllmLoaded && webllmFunctions && llmState.status === "idle") {
      webllmFunctions.warmupWebLLM();
    }
  }, [isOpen, webllmLoaded, webllmFunctions, llmState.status]);

  function llmStatusText() {
    if (llmState.status === "ready") {
      return `WebLLM ativo (${llmState.model})`;
    }

    if (llmState.status === "loading") {
      return `WebLLM a carregar (${Math.round((llmState.progress || 0) * 100)}%)`;
    }

    if (llmState.status === "fallback") {
      return "Fallback heurístico ativo";
    }

    return "WebLLM inativo";
  }

  async function sendQuery(payload) {
    const userQuestion = (payload && payload.question)?.trim() || "";
    if (!userQuestion) {
      return;
    }

    setIsLoading(true);

    const userMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      text: userQuestion,
    };

    let nextMessages = [];
    setMessages((prev) => {
      nextMessages = [...prev, userMessage];
      return nextMessages;
    });

    try {
      const storedBets = loadStoredBets();
      const analytics = computeAssistantAnalytics(storedBets, payload.params);
      analytics.params = payload.params || {};
      const assistantContext = {
        ...buildAssistantContext(userQuestion, payload.intent, payload.params, analytics),
        conversation: buildRecentConversation(nextMessages),
      };

      let assistantReply = "";
      const deterministicReply = buildDeterministicReply(userQuestion, analytics);

      if (deterministicReply) {
        assistantReply = deterministicReply;
      } else if (isGeneralConversationQuestion(userQuestion)) {
        assistantReply = buildGeneralConversationFallback(userQuestion);
      }

      if (!assistantReply && isGeneralConversationQuestion(userQuestion) && llmState.status !== "ready") {
        assistantReply = buildGeneralLoadingFallback();
      }

      if (!assistantReply && webllmFunctions && webllmLoaded && typeof webllmFunctions.generateAssistantReply === "function") {
        try {
          if (llmState.status !== "ready") {
            await withTimeout(webllmFunctions.warmupWebLLM(), 10000);
            let attempts = 0;
            while (llmState.status !== "ready" && attempts < 8) {
              attempts += 1;
              await wait(400);
            }
          }

          const generated = await withTimeout(webllmFunctions.generateAssistantReply(assistantContext), 9000);
          if (generated) {
            assistantReply = generated;
          }
        } catch {
          // ignore and fallback
        }
      }

      if (!assistantReply) {
        if (isGeneralConversationQuestion(userQuestion)) {
          assistantReply = buildGeneralConversationFallback(userQuestion);
        } else {
          const deterministicReply = buildDeterministicReply(userQuestion, analytics);
          assistantReply = deterministicReply || formatAssistantReply(payload.intent, analytics, userQuestion);
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          text: assistantReply,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-e`,
          role: "assistant",
          text: `Erro: ${error.message}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const question = inputValue.trim();

    if (!question || isLoading) {
      return;
    }

    const parsed = quickParseIntent(question);

    await sendQuery({
      question,
      intent: parsed.intent,
      params: parsed.params,
    });

    setInputValue("");
  }

  async function handleQuickAction(type) {
    if (isLoading) {
      return;
    }

    const payload = buildQuickActionPayload(type);
    await sendQuery(payload);
  }

  return (
    <section className="assistant-floating" aria-label="Assistant WebLLM">
      {!isOpen && (
        <button
          type="button"
          className="assistant-toggle"
          aria-label="Abrir assistant"
          onClick={() => setIsOpen(true)}
        >
          Assistant
          <span className="assistant-toggle-hint">Ctrl+M</span>
        </button>
      )}

      {isOpen && (
        <div className={`assistant-panel ${isExpanded ? "expanded" : "compact"}`} role="dialog" aria-modal="false" aria-label="Painel do assistant">
          <header className="assistant-header">
            <strong>Risk Assistant</strong>
            <div className="assistant-actions">
              <button
                type="button"
                className="assistant-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-label={isExpanded ? "Compactar" : "Expandir"}
              >
                {isExpanded ? "Compactar" : "Expandir"}
              </button>
              <button
                type="button"
                className="assistant-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Minimizar assistant"
              >
                Minimizar
              </button>
            </div>
          </header>

          <div className="assistant-shortcuts" aria-label="Atalhos rápidos">
            <button type="button" onClick={() => handleQuickAction("summary")}>Resumo</button>
            <button type="button" onClick={() => handleQuickAction("by-sport")}>Por desporto</button>
            <button type="button" onClick={() => handleQuickAction("by-risk")}>Por risco</button>
            <button type="button" onClick={() => handleQuickAction("top-sports")}>Top desportos</button>
            <button type="button" onClick={() => handleQuickAction("recent")}>Últimas 5 apostas</button>
            <button type="button" onClick={() => handleQuickAction("critical")}>Risco crítico</button>
            <button type="button" onClick={() => handleQuickAction("top-stake")}>Maior stake</button>
          </div>

          <p className={`assistant-llm-state ${llmState.status}`}>{llmStatusText()}</p>

          <div className="assistant-messages" aria-live="polite">
            {visibleMessages.length === 0 && <p className="assistant-empty">Pergunta por resumo, desporto ou risco.</p>}
            {visibleMessages.map((message) => (
              <p key={message.id} className={`assistant-message ${message.role}`}>
                {message.text}
              </p>
            ))}
          </div>

          <form className="assistant-form" onSubmit={handleSubmit}>
            <input
              type="text"
              placeholder="Ex: mostra risco das últimas 24h"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              aria-label="Pergunta ao assistant"
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !inputValue.trim()}>
              {isLoading ? "A processar..." : "Enviar"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}