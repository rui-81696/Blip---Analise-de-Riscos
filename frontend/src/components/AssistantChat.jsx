import { useEffect, useMemo, useRef, useState } from "react";
import "./AssistantChat.scss";
import { isRuleManagementIntent } from "../utils/highlightRules";

// Janela de apostas pedida ao servidor por pergunta. As ferramentas de análise
// continuam a correr no cliente, mas sobre um conjunto LIMITADO obtido on-demand
// (já não há acúmulo no localStorage). Cobre os períodos comuns (hoje/ontem/7d);
// perguntas sobre histórico mais antigo ficam limitadas a esta janela.
const ASSISTANT_BETS_PERIOD = "7d";
const ASSISTANT_BETS_LIMIT = 200000;

async function fetchBetsWindow() {
  try {
    const res = await fetch(`/api/bets/range?period=${ASSISTANT_BETS_PERIOD}&limit=${ASSISTANT_BETS_LIMIT}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.bets) ? data.bets : [];
  } catch {
    return [];
  }
}

/**
 * Risk Assistant — UI flutuante baseada em WebLLM.
 *
 * Comportamento:
 *  - O modelo Llama é carregado APENAS quando o utilizador abre o chat
 *    pela primeira vez (lazy import + warmup).
 *  - As ferramentas correm client-side sobre uma janela de apostas obtida
 *    on-demand do servidor (REST).
 *  - Pipeline normal: LLM-router → tool determinística → LLM-composer (com streaming).
 *  - Pipeline dedicado: botão ⚠ executa `runRiskAnalysis` (detect-anomalies + briefing).
 *  - Multi-turn: histórico recente é passado quando a pergunta tem referências.
 *  - Atalho: Ctrl+M / Cmd+M abre/fecha.
 */
export default function AssistantChat({ highlightRules = [], onRulesChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [llmState, setLlmState] = useState({ status: "idle", progress: 0, model: "" });
  const [clientApi, setClientApi] = useState(null);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const clientApiRef = useRef(null);

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

  // ── Lazy load do WebLLM quando o chat abre ────────────────────────────
  useEffect(() => {
    if (!isOpen) return;

    setLlmState({ status: "loading", progress: 0, model: "a carregar…" });

    let unsubscribe = null;

    const attach = (mod) => {
      unsubscribe = mod.subscribeWebLLMStatus((payload) => setLlmState(payload));
      mod.warmupWebLLM();
    };

    if (clientApiRef.current) {
      attach(clientApiRef.current);
      return () => {
        if (typeof unsubscribe === "function") unsubscribe();
      };
    }

    import("../services/webllmClient")
      .then((mod) => {
        clientApiRef.current = mod;
        setClientApi(mod);
        attach(mod);
      })
      .catch((error) => {
        console.error("[AssistantChat] falha a carregar o módulo WebLLM:", error);
        setLlmState({ status: "fallback", progress: 0, model: "indisponível" });
      });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [isOpen]);

  // ── Auto-scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isOpen, isExpanded]);

  // ── Foco no input ──────────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Helpers de UI ──────────────────────────────────────────────────────
  // Atualiza a última mensagem do assistant (in-place), criando-a se preciso.
  // Usado pelo callback onToken para fazer streaming visual.
  function appendToLastAssistant(delta) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        const updated = { ...last, text: (last.text || "") + delta };
        return [...prev.slice(0, -1), updated];
      }
      // Cria nova bolha de assistant em modo streaming
      return [
        ...prev,
        { id: `${Date.now()}-a`, role: "assistant", text: delta, streaming: true },
      ];
    });
  }

  function finalizeStreaming(finalText) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === "assistant" && last.streaming) {
        const updated = { ...last, text: finalText || last.text, streaming: false };
        return [...prev.slice(0, -1), updated];
      }
      // Caso raro: nenhum token chegou (LLM falhou silenciosamente)
      if (finalText) {
        return [...prev, { id: `${Date.now()}-a`, role: "assistant", text: finalText }];
      }
      return prev;
    });
  }

  // ── Envio de pergunta (com streaming) ─────────────────────────────────
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
      // Gestão de Regras de Highlight em linguagem natural (não corre analytics).
      if (isRuleManagementIntent(clean)) {
        if (clientApi && typeof clientApi.manageHighlightRules === "function") {
          const { nextRules } = await clientApi.manageHighlightRules({
            question: clean,
            rules: highlightRules,
            onToken: appendToLastAssistant,
          });
          if (typeof onRulesChange === "function" && Array.isArray(nextRules)) {
            onRulesChange(nextRules);
          }
          finalizeStreaming("");
        } else {
          const msg = "O assistente ainda está a inicializar. Tenta de novo em alguns segundos.";
          appendToLastAssistant(msg);
          finalizeStreaming(msg);
        }
        return;
      }

      const bets = await fetchBetsWindow();
      const history = nextMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: m.text }));

      let finalText = "";
      if (clientApi && typeof clientApi.answerQuestion === "function") {
        finalText = await clientApi.answerQuestion({
          question: clean,
          bets,
          history,
          onToken: appendToLastAssistant,
        });
      } else {
        finalText = "O assistente ainda está a inicializar. Tenta de novo em alguns segundos.";
        appendToLastAssistant(finalText);
      }

      finalizeStreaming(finalText);
    } catch (error) {
      console.error("[AssistantChat] erro a processar pergunta:", error);
      finalizeStreaming("");
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", text: `Ocorreu um erro: ${error.message}` },
      ]);
    } finally {
      setIsThinking(false);
    }
  }

  // ── Análise de risco (pipeline dedicado) ──────────────────────────────
  async function runRiskAnalysis() {
    if (isThinking) return;
    setIsThinking(true);

    // Mensagem de utilizador implícita para deixar o contexto claro na conversa
    const userMessage = { id: `${Date.now()}-u`, role: "user", text: "⚠ Análise de risco" };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const bets = await fetchBetsWindow();
      const history = [...messages, userMessage]
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, text: m.text }));

      let finalText = "";
      if (clientApi && typeof clientApi.runRiskAnalysis === "function") {
        finalText = await clientApi.runRiskAnalysis({
          bets,
          history,
          onToken: appendToLastAssistant,
        });
      } else {
        finalText = "O assistente ainda está a inicializar. Tenta de novo em alguns segundos.";
        appendToLastAssistant(finalText);
      }

      finalizeStreaming(finalText);
    } catch (error) {
      console.error("[AssistantChat] erro na análise de risco:", error);
      finalizeStreaming("");
      setMessages((prev) => [
        ...prev,
        { id: `${Date.now()}-e`, role: "assistant", text: `Falha na análise de risco: ${error.message}` },
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
    { label: "Hoje vs ontem", text: "Compara o volume e exposição de hoje vs ontem." },
    { label: "Resumo geral 24h", text: "Dá-me um resumo geral das últimas 24 horas." },
    { label: "Regra: destacar stake alto", text: "Adiciona uma regra para destacar linhas com stake total maior que 8000" },
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
              {/* Botão Análise de Risco — mesma fila, mesmo estilo, antes dos outros */}
              <button
                type="button"
                className="assistant-btn assistant-btn-risk"
                onClick={runRiskAnalysis}
                disabled={isThinking}
                aria-label="Análise de risco"
                title="Análise de risco — detetar anomalias"
              >
                ⚠
              </button>
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
              <p
                key={message.id}
                className={`assistant-message ${message.role}${message.streaming ? " streaming" : ""}`}
              >
                {message.text}
                {message.streaming && <span className="streaming-caret" aria-hidden="true">▍</span>}
              </p>
            ))}

            {isThinking && !visibleMessages.some((m) => m.streaming) && (
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