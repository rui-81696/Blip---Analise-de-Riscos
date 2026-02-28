/*
 * ===== Chat.jsx =====
 * COMPONENTE: Interface de Chat com Assistente IA (WebLLM)
 *
 * Este componente implementa um chat flutuante (no canto inferior direito)
 * que no futuro será integrado com WebLLM para permitir consultas em
 * linguagem natural sobre os dados de apostas.
 *
 * POR AGORA: é um placeholder (protótipo) que simula respostas.
 *
 * CONCEITOS REACT USADOS:
 * - useState: para gerir o estado das mensagens, input e loading
 * - Eventos: onChange, onClick, onKeyDown para capturar interações do user
 * - Renderização de listas: .map() para mostrar cada mensagem
 * - Toggle (abrir/fechar): estado isOpen controla visibilidade do chat
 */

// useState permite criar variáveis de estado dentro do componente
import { useState } from 'react';
import './Chat.scss';

/**
 * Componente Chat
 *
 * Props:
 * @param {function} onApplyFilters - Callback para aplicar filtros (futuro uso com WebLLM)
 */
export default function Chat({ onApplyFilters }) {
  /*
   * ─── ESTADOS DO COMPONENTE ───
   *
   * messages: array de mensagens do chat. Cada mensagem tem:
   *   - role: 'user' (mensagem do utilizador) ou 'assistant' (resposta do bot)
   *   - content: o texto da mensagem
   * Começa com uma mensagem de boas-vindas do assistente.
   */
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Olá! Sou o assistente Blip. Pode fazer-me perguntas sobre os dados de apostas em linguagem natural. Exemplo: "Mostra apostas de futebol com risco alto" ou "Total de apostas acima de 500€".',
    },
  ]);

  // O texto que o utilizador está a escrever no input
  const [input, setInput] = useState('');

  // Flag que indica se o bot está a "pensar" (a gerar resposta)
  const [isLoading, setIsLoading] = useState(false);

  // Flag que controla se o chat está aberto (visível) ou fechado
  const [isOpen, setIsOpen] = useState(false);

  /**
   * Função chamada quando o utilizador envia uma mensagem.
   * 1. Valida que o input não está vazio
   * 2. Adiciona a mensagem do user ao array de mensagens
   * 3. Limpa o input
   * 4. Simula uma resposta do assistente (placeholder por agora)
   */
  const handleSend = async () => {
    // !input.trim() verifica se a mensagem está vazia (trim remove espaços)
    // || isLoading impede enviar enquanto o bot está a "pensar"
    if (!input.trim() || isLoading) return;

    // Criar objeto de mensagem do utilizador
    const userMessage = { role: 'user', content: input.trim() };

    // Adicionar ao array de mensagens (usando spread ... para manter as anteriores)
    // prev = estado anterior; [...prev, userMessage] = estado anterior + nova mensagem
    setMessages((prev) => [...prev, userMessage]);

    // Limpar o campo de input
    setInput('');

    // Indicar que o bot está a processar
    setIsLoading(true);

    // TODO: Aqui será integrado o WebLLM (Semanas 7-8)
    // Por agora, simula uma resposta com setTimeout (atraso de 1 segundo)
    // setTimeout(callback, milissegundos) executa a callback após o tempo indicado
    setTimeout(() => {
      const assistantMessage = {
        role: 'assistant',
        content:
          '⚠️ O WebLLM ainda não está integrado (planeado para Semanas 7-8). Esta funcionalidade permitirá consultas em linguagem natural que serão convertidas automaticamente em filtros.',
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000); // 1000ms = 1 segundo de delay
  };

  /**
   * Captura a tecla Enter para enviar a mensagem
   * e.shiftKey verifica se Shift está pressionado (para permitir novas linhas)
   * e.preventDefault() impede o comportamento padrão (nova linha no input)
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {/*
       * Fragment (<>...</>) permite retornar múltiplos elementos sem uma div extra.
       * Em React, cada componente deve retornar um único elemento raiz.
       * O Fragment resolve isso sem adicionar HTML desnecessário ao DOM.
       */}

      {/* ─── BOTÃO FLUTUANTE ─── */}
      {/* Este botão fica fixo no canto inferior direito (CSS: position: fixed) */}
      {/* Ao clicar, alterna entre aberto/fechado: setIsOpen(!isOpen) */}
      <button
        className={`chat-toggle ${isOpen ? 'chat-toggle--active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Assistente Blip"
      >
        {/* Operador ternário: se isOpen é true mostra ✕, senão mostra 💬 */}
        {isOpen ? '✕' : '💬'}
      </button>

      {/* ─── JANELA DE CHAT ─── */}
      {/* Só é renderizada se isOpen é true (renderização condicional com &&) */}
      {isOpen && (
        <div className="chat">
          {/* Cabeçalho do chat */}
          <div className="chat__header">
            <div className="chat__header-info">
              <span className="chat__header-title">Assistente Blip</span>
              <span className="chat__header-status">WebLLM — Em desenvolvimento</span>
            </div>
          </div>

          {/* ─── ÁREA DE MENSAGENS ─── */}
          <div className="chat__messages">
            {/*
             * .map() percorre cada mensagem e cria um div para cada uma.
             * A prop "key" usa o índice (index) - não é ideal mas funciona
             * para listas que não são reordenadas.
             *
             * A classe CSS muda conforme a role:
             * - chat__message--user: alinhado à direita, cor primária
             * - chat__message--assistant: alinhado à esquerda, cor neutra
             */}
            {messages.map((msg, index) => (
              <div key={index} className={`chat__message chat__message--${msg.role}`}>
                <div className="chat__message-content">{msg.content}</div>
              </div>
            ))}

            {/* Indicador de "a escrever..." quando o bot está a processar */}
            {isLoading && (
              <div className="chat__message chat__message--assistant">
                <div className="chat__message-content chat__typing">
                  {/* 3 bolinhas animadas (ver CSS: @keyframes typing) */}
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>

          {/* ─── ÁREA DE INPUT ─── */}
          <div className="chat__input-area">
            {/*
             * Input controlado pelo React:
             * - value={input}: o valor exibido vem do estado
             * - onChange: quando o user escreve, atualiza o estado
             * - onKeyDown: captura teclas (Enter para enviar)
             * - disabled: desativa o input enquanto o bot processa
             */}
            <input
              className="chat__input"
              type="text"
              placeholder="Faça uma pergunta sobre os dados..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            {/* Botão de enviar - desativado se o input está vazio ou se está a processar */}
            <button
              className="chat__send-btn"
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </>
  );
}
