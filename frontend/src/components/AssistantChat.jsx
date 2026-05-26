import { useEffect, useMemo, useRef, useState } from "react";
import "./AssistantChat.scss";
function normalizeQuestionText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s+.-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Lightweight fallback parser for immediate use before WebLLM loads
 */
function quickParseIntent(question = "") {
  const normalized = normalizeQuestionText(question);

  if (normalized.includes("ontem") || normalized.includes("yesterday")) {
    return { intent: "summary", params: { period: "yesterday" } };
  }

  if (normalized.includes("ultima semana") || normalized.includes("semana passada") || normalized.includes("last week")) {
    return { intent: "summary", params: { period: "7d" } };
  }

  if (normalized.includes("hoje") || normalized.includes("today")) {
    return { intent: "summary", params: { period: "today" } };
  }

  if (normalized.includes("selection") || normalized.includes("selecao")) {
    if (normalized.includes("odd mais usada") || normalized.includes("odd mais frequente") || normalized.includes("odd mais repetida")) {
      return { intent: "selection-odd-mode", params: { period: "24h" } };
    }

    if (normalized.includes("media de odd") || normalized.includes("odd media")) {
      return { intent: "selection-average-odd", params: { period: "24h" } };
    }

    if (normalized.includes("mais apostas")) {
      return { intent: "selection-top", params: { period: "24h" } };
    }
  }

  if (normalized.includes("evento") || normalized.includes("event")) {
    if (normalized.includes("quantas selections") || normalized.includes("numero de selections")) {
      return { intent: "event-selection-count", params: { period: "24h" } };
    }
  }

  if (normalized.includes("bettype") || normalized.includes("bet type") || normalized.includes("tipo de aposta")) {
    if (normalized.includes("mais comum")) {
      return { intent: "bettype-top", params: { period: "24h" } };
    }

    return { intent: "bettype-distribution", params: { period: "24h" } };
  }

  if (normalized.includes("top desportos") || normalized.includes("top sports")) {
    return { intent: "top-sports", params: { period: "24h" } };
  }

  if ((normalized.includes("odd mais alta") || normalized.includes("maior odd")) && (normalized.includes("evento") || normalized.includes("event") || normalized.includes("mercado") || normalized.includes("market"))) {
    return { intent: "event-highest-odd", params: { period: "24h" } };
  }

  if (
    normalized.includes("prejuizo")
    || normalized.includes("perda max")
    || normalized.includes("maior perda")
    || normalized.includes("maior exposicao")
    || normalized.includes("maior exposição")
  ) {
    return { intent: "top-loss-bet", params: { period: "24h" } };
  }

  if (normalized.includes("legs")) {
    return { intent: "legs", params: { period: "24h" } };
  }
  if (normalized.includes("odd mais alta") || normalized.includes("maior odd") || normalized.includes("odd mais alta")) {
    return { intent: "highest-odd", params: { period: "24h" } };
  }
  if (normalized.includes("maior stake") || normalized.includes("mais stake") || normalized.includes("aposta com mais stake")) {
    return { intent: "top-stake", params: { period: "24h", limit: 5 } };
  }
  if ((normalized.includes("quantas apostas") || normalized.includes("quantos apostas") || normalized.includes("numero de apostas") || normalized.includes("número de apostas")) && (normalized.includes("evento") || normalized.includes("event")) && (normalized.includes("mercado") || normalized.includes("market"))) {
    return { intent: "event-summary", params: { period: "24h" } };
  }
  if (normalized.includes("distribuicao mercados") || normalized.includes("distribuição mercados") || (normalized.includes("distribuicao") || normalized.includes("distribuição")) && normalized.includes("mercados")) {
    return { intent: "bettype-distribution", params: { period: "today" } };
  }
  if (normalized.includes("ultimas apostas") || normalized.includes("últimas apostas") || normalized.includes("recent")) {
    return { intent: "recent", params: { period: "24h", limit: 5 } };
  }
  if (normalized.includes("ultimas 5 apostas") || normalized.includes("últimas 5 apostas")) {
    return { intent: "recent", params: { period: "24h", limit: 5 } };
  }

  if (normalized.includes("altura do dia") || normalized.includes("hora do dia") || normalized.includes("pico de apostas")) {
    if (normalized.includes("sport") || normalized.includes("desporto")) {
      return { intent: "peak-hour-sport", params: { period: "7d" } };
    }

    return { intent: "peak-hour", params: { period: "yesterday" } };
  }

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
    return { question: "Top desportos", intent: "top-sports", params: { period: "24h", limit: 3 } };
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

  if (type === "top-loss-bet") {
    return { question: "Maior exposição potencial", intent: "top-loss-bet", params: { period: "24h" } };
  }

  if (type === "peak-hour") {
    return { question: "Hora do dia com mais apostas ontem", intent: "peak-hour", params: { period: "yesterday" } };
  }

  if (type === "selection-top") {
    return { question: "Selection com mais apostas", intent: "selection-top", params: { period: "yesterday" } };
  }

  if (type === "selection-average-odd") {
    return { question: "Qual é a média de odd para apostas na selection Draw?", intent: "selection-average-odd", params: { period: "24h" } };
  }

  if (type === "selection-odd-mode") {
    return { question: "Qual foi a odd mais usada nas apostas para a selection No?", intent: "selection-odd-mode", params: { period: "24h" } };
  }

  if (type === "event-summary") {
    return { question: "Quantas apostas no evento Juventus vs AC Milan, com o mercado handicap?", intent: "event-summary", params: { period: "24h" } };
  }

  if (type === "event-selection-count") {
    return { question: "Quantas selections tem o evento Benfica vs Porto?", intent: "event-selection-count", params: { period: "24h" } };
  }

  if (type === "bettype-top") {
    return { question: "Qual o mercado mais comum?", intent: "bettype-top", params: { period: "24h" } };
  }

  if (type === "bettype-distribution") {
    return { question: "Distribuição por betType hoje", intent: "bettype-distribution", params: { period: "today" } };
  }

  if (type === "top-loss-bet") {
    return { question: "Aposta com maior prejuízo potencial", intent: "top-loss-bet", params: { period: "24h" } };
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
    "resumo",
    "sumario",
    "sumário",
    "geral",
    "overview",
    "summary",
    "bet",
    "bets",
    "bettype",
    "bet type",
    "stake",
    "odd",
    "risco",
    "prejuizo",
    "perda",
    "exposicao",
    "exposicao",
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
  const messagesEndRef = useRef(null);

  const visibleMessages = useMemo(() => messages, [messages]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isOpen, isExpanded]);

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
    const parsedIntent = payload?.intent
      ? { intent: payload.intent, params: payload.params || {} }
      : quickParseIntent(userQuestion);

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
      let assistantReply = "";

      if (isGeneralConversationQuestion(userQuestion)) {
        if (webllmFunctions && webllmLoaded && typeof webllmFunctions.generateAssistantReply === "function") {
          try {
            const assistantContext = {
              question: userQuestion,
              intent: "summary",
              params: { period: "24h" },
              analytics: {
                summary: { totalBets: 0, totalStake: 0, totalExposure: 0 },
                sports: [],
                topEvents: [],
                topSelections: [],
                riskBuckets: {},
                recentBets: [],
              },
              conversation: buildRecentConversation(nextMessages),
            };

            const generated = await withTimeout(webllmFunctions.generateAssistantReply(assistantContext), 6000);
            if (generated) {
              assistantReply = generated;
            }
          } catch {
            // fallback below
          }
        }

        if (!assistantReply) {
          assistantReply = buildGeneralConversationFallback(userQuestion) || buildGeneralLoadingFallback();
        }
      } else {
        try {
          const response = await fetch("/api/assistant/query", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              question: userQuestion,
              intent: parsedIntent.intent,
              params: parsedIntent.params,
            }),
          });

          if (!response.ok) {
            throw new Error(`Backend respondeu com ${response.status}`);
          }

          const result = await response.json();
          assistantReply = result.explanation || (typeof result.data === "string" ? result.data : "");

          if (!assistantReply && result.data) {
            assistantReply = "Resposta recebida, mas sem texto de explicação.";
          }
        } catch {
          assistantReply = "Não consegui obter dados fiáveis agora. Tenta novamente quando o backend estiver disponível.";
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

    await sendQuery({
      question,
      ...quickParseIntent(question),
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
            <button type="button" onClick={() => handleQuickAction("top-sports")}>Top desportos</button>
            <button type="button" onClick={() => handleQuickAction("recent")}>Últimas 5 apostas</button>
            <button type="button" onClick={() => handleQuickAction("top-stake")}>Maior stake</button>
            <button type="button" onClick={() => handleQuickAction("top-loss-bet")}>Maior exposição</button>
            <button type="button" onClick={() => handleQuickAction("bettype-top")}>Mercado mais comum</button>
            <button type="button" onClick={() => handleQuickAction("bettype-distribution")}>Distribuição mercados</button>
            <button type="button" onClick={() => handleQuickAction("peak-hour")}>Pico de apostas</button>
          </div>

          <p className={`assistant-llm-state ${llmState.status}`}>{llmStatusText()}</p>

          <div className="assistant-messages" aria-live="polite">
            {visibleMessages.length === 0 && <p className="assistant-empty">Pergunta por resumo, desporto ou risco.</p>}
            {visibleMessages.map((message) => (
              <p key={message.id} className={`assistant-message ${message.role}`}>
                {message.text}
              </p>
            ))}
            <div ref={messagesEndRef} />
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