import { useEffect, useMemo, useState } from "react";
import "./AssistantChat.scss";

const API_URL = "/api/assistant/query";
const HISTORY_PREVIEW_LIMIT = 3;

/**
 * Lightweight fallback parser for immediate use before WebLLM loads
 */
function quickParseIntent(question = "") {
  const normalized = question.toLowerCase();

  if (normalized.includes("risco") || normalized.includes("risk")) {
    return { intent: "by-risk", params: { period: "24h" } };
  }

  if (
    normalized.includes("desporto")
    || normalized.includes("esporte")
    || normalized.includes("sport")
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

  return {
    question: "Dá-me um resumo geral",
    intent: "summary",
    params: { period: "24h" },
  };
}

function summarizeData(data, intent) {
  if (!data) return "Sem dados.";

  if (intent === "summary") {
    return `Total: ${data.totalBets ?? 0} apostas, stake €${Number(data.totalStake ?? 0).toFixed(2)}, exposição €${Number(data.totalExposure ?? 0).toFixed(2)}.`;
  }

  if (intent === "by-sport") {
    const top = Array.isArray(data.sports) ? data.sports.slice(0, 2) : [];
    if (top.length === 0) return "Sem desportos para este filtro.";
    return top.map((s) => `${s.sport}: ${s.betCount} apostas`).join(" | ");
  }

  if (intent === "by-risk") {
    const buckets = data.riskBuckets || {};
    return `Low ${buckets.low?.count ?? 0} | Medium ${buckets.medium?.count ?? 0} | High ${buckets.high?.count ?? 0} | Critical ${buckets.critical?.count ?? 0}`;
  }

  return "Resposta recebida.";
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
    const userQuestion = payload.question?.trim() || "";
    if (!userQuestion) {
      return;
    }

    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-u`,
        role: "user",
        text: userQuestion,
      },
    ]);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Falha no assistant.");
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: "assistant",
          text: data.explanation || summarizeData(data.data, payload.intent),
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

    // Use WebLLM if available, otherwise fallback to quick parser
    let parsed;
    if (webllmFunctions && webllmLoaded) {
      parsed = await webllmFunctions.resolveIntent(question);
    } else {
      parsed = quickParseIntent(question);
    }

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