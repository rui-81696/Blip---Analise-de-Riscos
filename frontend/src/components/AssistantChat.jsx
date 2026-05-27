import { useEffect, useMemo, useRef, useState } from "react";
import "./AssistantChat.scss";
import { loadStoredBets } from "../utils/betsStore";

/**
 * Risk Assistant — UI flutuante baseada em WebLLM.
 *
 * Comportamento:
 *  - O modelo Llama é carregado APENAS quando o utilizador abre o chat
 *    pela primeira vez (lazy import + warmup), para não pesar no boot.
 *  - Toda a análise é feita client-side a partir das apostas guardadas
 *    no betsStore (localStorage + ingest WebSocket).
 *  - Cada pergunta passa por: LLM-router → tool determinística → LLM-composer.
 *  - Atalho de teclado: Ctrl+M / Cmd+M abre e fecha o painel.
 */
export default function AssistantChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [llmState, setLlmState] = useState({ status: "idle", progress: 0, model: "" });
  const [clientApi, setClientApi] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const visibleMessages = useMemo(() => messages, [messages]);

  // ── Atalho de teclado ──────────────────────────────────────────────────
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

  // ── Lazy load do WebLLM quando o chat abre pela primeira vez ───────────
  useEffect(() => {
    if (!isOpen || clientApi) return;

    setLlmState({ status: "loading", progress: 0, model: "a carregar…" });

    let unsubscribe = null;

    import("../services/webllmClient")
      .then((mod) => {
        setClientApi(mod);
        unsubscribe = mod.subscribeWebLLMStatus((payload) => setLlmState(payload));
        // Dispara o download/init do modelo em background — não bloqueia a UI.
        mod.warmupWebLLM();
      })
      .catch((error) => {
        console.error("[AssistantChat] falha a carregar o módulo WebLLM:", error);
        setLlmState({ status: "fallback", progress: 0, model: "indisponível" });
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isOpen, clientApi]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isOpen, isExpanded]);

  // ── Foco no input quando abre ──────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Envio de pergunta ──────────────────────────────────────────────────
  async function sendQuestion(question) {
    const clean = String(question || "").trim();
    if (!clean || isThinking) return;

    setIsThinking(true);

    const userMessage = { id: `${Date.now()}-u`, role: "user", text: clean };
    let nextMessages = [];
    setMessages((prev) => {
      nextMessages = [...prev, userMessage];
      return nextMessages;
    });

    try {
      // O dataset vem 100% do frontend (betsStore alimentado pelo WS).
      const bets = loadStoredBets();
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: m.text }));

      let reply = "";
      if (clientApi && typeof clientApi.answerQuestion === "function") {
        reply = await clientApi.answerQuestion({ question: clean, bets, history });
      } else {
        // Módulo ainda nem foi importado (caso muito raro: clique rápido)
        reply = "O assistente ainda está a inicializar. Tenta de novo em alguns segundos.";
      }

      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-a`, role: "assistant", text: reply || "Sem resposta." },
      ]);
    } catch (error) {
      console.error("[AssistantChat] erro a processar pergunta:", error);
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", text: `Ocorreu um erro: ${error.message}` },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const value = inputValue.trim();
    if (!value || isThinking) return;
    sendQuestion(value);
    setInputValue("");
  }

  function handleSuggestion(text) {
    if (isThinking) return;
    sendQuestion(text);
  }

  function clearConversation() {
    setMessages([]);
  }

  // ── Texto de estado do modelo ──────────────────────────────────────────
  function llmStatusText() {
    if (llmState.status === "ready") return `🟢 Llama pronto`;
    if (llmState.status === "loading") return `🟡 Llama a carregar — ${Math.round((llmState.progress || 0) * 100)}%`;
    if (llmState.status === "fallback") return `🔴 Modelo indisponível — a usar análise determinística`;
    return `⚪ Modelo inativo`;
  }

  const SUGGESTIONS = [
    { label: "Selection mais apostada ontem", text: "Qual foi a selection que teve mais apostas ontem?" },
    { label: "Distribuição betType hoje", text: "Qual é a distribuição de bets por betType hoje?" },
    { label: "Maior prejuízo potencial", text: "Qual foi a bet que mais pode dar prejuízo à casa?" },
    { label: "Pico de apostas ontem", text: "Qual foi a altura do dia de ontem que tivemos um maior número de apostas?" },
    { label: "Pico — Tennis (7d)", text: "Qual a altura do dia que temos mais apostas para o sport Tennis com base na última semana?" },
    { label: "betType mais comum — Football", text: "Qual é o betType mais comum para apostas no sport Football?" },
    { label: "Resumo geral 24h", text: "Dá-me um resumo geral das últimas 24 horas." },
  ];

  return (
    <section className="assistant-floating" aria-label="Risk Assistant">
      {!isOpen && (
        <button
          type="button"
          className="assistant-toggle"
          aria-label="Abrir Risk Assistant"
          onClick={() => setIsOpen(true)}
        >
          <span className="assistant-toggle-icon" aria-hidden="true">💬</span>
          <span>Risk Assistant</span>
          <span className="assistant-toggle-hint">Ctrl+M</span>
        </button>
      )}

      {isOpen && (
        <div
          className={`assistant-panel ${isExpanded ? "expanded" : "compact"}`}
          role="dialog"
          aria-modal="false"
          aria-label="Painel do Risk Assistant"
        >
          <header className="assistant-header">
            <div className="assistant-title">
              <strong>Risk Assistant</strong>
              <span className={`assistant-llm-state ${llmState.status}`}>{llmStatusText()}</span>
            </div>

            <div className="assistant-actions">
              <button
                type="button"
                className="assistant-btn"
                onClick={clearConversation}
                aria-label="Limpar conversa"
                title="Limpar conversa"
              >
                Limpar
              </button>
              <button
                type="button"
                className="assistant-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-label={isExpanded ? "Compactar painel" : "Expandir painel"}
                title={isExpanded ? "Compactar" : "Expandir"}
              >
                {isExpanded ? "▭" : "▢"}
              </button>
              <button
                type="button"
                className="assistant-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Minimizar assistant"
                title="Minimizar"
              >
                ✕
              </button>
            </div>
          </header>

          {llmState.status === "loading" && (
            <div className="assistant-progress" aria-live="polite">
              <div
                className="assistant-progress-bar"
                style={{ width: `${Math.round((llmState.progress || 0) * 100)}%` }}
              />
            </div>
          )}

          <div className="assistant-messages" aria-live="polite">
            {visibleMessages.length === 0 && (
              <div className="assistant-welcome">
                <p className="assistant-welcome-title">
                  Olá 👋 Sou o teu analista de risco.
                </p>
                <p className="assistant-welcome-sub">
                  Faço análise sobre as apostas no dashboard. Algumas sugestões:
                </p>
                <div className="assistant-suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      type="button"
                      className="assistant-suggestion"
                      onClick={() => handleSuggestion(s.text)}
                      disabled={isThinking}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {visibleMessages.map((message) => (
              <p key={message.id} className={`assistant-message ${message.role}`}>
                {message.text}
              </p>
            ))}

            {isThinking && (
              <p className="assistant-message assistant typing" aria-label="A pensar">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          <form className="assistant-form" onSubmit={handleSubmit}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Ex.: qual a selection com mais apostas ontem?"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              aria-label="Pergunta ao assistant"
              disabled={isThinking}
            />
            <button type="submit" disabled={isThinking || !inputValue.trim()}>
              {isThinking ? "…" : "Enviar"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}