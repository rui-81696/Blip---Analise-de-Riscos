/*
 * ===== App.jsx =====
 * Este é o COMPONENTE PRINCIPAL da aplicação.
 * Um "componente" em React é como um bloco de construção reutilizável
 * que contém HTML (JSX) + lógica (JavaScript) + estilos (CSS/SCSS).
 *
 * Este componente:
 * 1. Junta todos os outros componentes (tabela, filtros, métricas, chat)
 * 2. Gere o estado global (dados das apostas, filtros, paginação)
 * 3. Implementa o "polling" (atualização automática a cada 30 segundos)
 *
 * CONCEITOS REACT IMPORTANTES:
 * - useEffect: executa código quando o componente é montado ou quando algo muda
 * - Props: dados passados de um componente "pai" para um componente "filho"
 * - Hooks: funções especiais do React (começam com "use") que gerem estado e efeitos
 */

// "useEffect" é um Hook do React que permite executar código em momentos específicos
// (ex: quando a página carrega, ou a cada X segundos)
import { useEffect } from 'react';

// Importar os nossos hooks personalizados que gerem os dados das apostas e métricas
// (hooks são funções que encapsulam lógica reutilizável)
import { useBets, useMetrics } from './hooks/useBets';

// Importar todos os componentes visuais que compõem a aplicação
import BetsTable from './components/BetsTable/BetsTable';      // Tabela de apostas
import Pagination from './components/Pagination/Pagination';    // Navegação entre páginas
import Filters from './components/Filters/Filters';            // Painel de filtros
import MetricsPanel from './components/MetricsPanel/MetricsPanel'; // Painel de métricas
import Chat from './components/Chat/Chat';                      // Chat com assistente IA

// Importar os estilos específicos deste componente
import './App.scss';

// Intervalo de polling para atualização automática (RF-12)
// 30000 milissegundos = 30 segundos (a cada 30s os dados são atualizados)
const POLLING_INTERVAL = 30000;

/**
 * Componente principal da aplicação Blip - Risk Analysis
 * Esta é uma "function component" - a forma moderna de criar componentes em React
 */
function App() {
  /*
   * ─── HOOK useBets() ───
   * Este hook devolve um objeto com tudo o que precisamos para gerir as apostas.
   * Usa "destructuring" para extrair cada propriedade do objeto:
   *   bets         → Array com as apostas da página atual
   *   pagination   → Objeto com info de paginação (página atual, total, etc.)
   *   filters      → Objeto com os filtros ativos
   *   sortBy       → Nome da coluna pela qual estamos a ordenar
   *   sortOrder    → Direção da ordenação ('asc' = crescente, 'desc' = decrescente)
   *   loading      → true/false - se os dados estão a ser carregados
   *   error        → Mensagem de erro (null se não houver erro)
   *   setPage      → Função para mudar de página
   *   setLimit     → Função para alterar quantos itens por página
   *   updateFilters → Função para aplicar novos filtros
   *   clearFilters  → Função para limpar todos os filtros
   *   handleSort    → Função para ordenar por uma coluna
   *   refetch       → Função para forçar uma nova busca de dados
   */
  const {
    bets,
    pagination,
    filters,
    sortBy,
    sortOrder,
    loading,
    error,
    setPage,
    setLimit,
    updateFilters,
    clearFilters,
    handleSort,
    refetch,
  } = useBets();

  /*
   * ─── HOOK useMetrics() ───
   * Similar ao useBets, mas para as métricas agregadas (totais, médias, etc.)
   * "loading: metricsLoading" renomeia "loading" para "metricsLoading" 
   * para não conflitar com o loading das apostas.
   * "refetch: refetchMetrics" renomeia "refetch" pelo mesmo motivo.
   */
  const { metrics, loading: metricsLoading, refetch: refetchMetrics } = useMetrics();

  /*
   * ─── POLLING AUTOMÁTICO (useEffect) ───
   * useEffect executa o código dentro dele quando o componente é montado.
   * 
   * setInterval: cria um temporizador que executa uma função repetidamente.
   * A cada 30 segundos, chama refetch() e refetchMetrics() para buscar dados novos.
   * 
   * "return () => clearInterval(interval)" é a função de "limpeza":
   * quando o componente é desmontado (removido da página), o temporizador é parado.
   * Isto evita memory leaks (fugas de memória).
   *
   * [refetch, refetchMetrics] é o array de dependências:
   * o useEffect volta a executar SE estas funções mudarem.
   */
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();          // Buscar apostas atualizadas
      refetchMetrics();   // Buscar métricas atualizadas
    }, POLLING_INTERVAL);

    // Função de limpeza - para o temporizador quando o componente é removido
    return () => clearInterval(interval);
  }, [refetch, refetchMetrics]);

  /*
   * ─── JSX (o "HTML" do React) ───
   * Abaixo está o que o componente vai renderizar (desenhar) na página.
   * JSX parece HTML mas é na verdade JavaScript - é transformado em chamadas React.
   *
   * Regras importantes do JSX:
   * - className em vez de class (porque "class" é palavra reservada em JS)
   * - Expressões JS dentro de { chaves }
   * - Cada componente deve retornar UM ÚNICO elemento raiz
   * - Comentários JSX: {/* texto */}
  /*
   * "&&" (short-circuit): renderiza o elemento APENAS se a condição for true
   * Ex: {error && <div>...</div>} → só mostra o erro se "error" não for null
   */

  return (
    // A div principal que envolve toda a aplicação
    <div className="app">

      {/* ─── HEADER (Cabeçalho) ─── */}
      <header className="app__header">
        <div className="app__header-content">
          {/* Logotipo */}
          <div className="app__logo">
            <span className="app__logo-icon">B</span> {/* A letra "B" como ícone */}
            <div className="app__logo-text">
              <h1 className="app__title">Blip</h1>
              <span className="app__subtitle">Risk Analysis</span>
            </div>
          </div>
          {/* Botão de atualização manual */}
          <div className="app__header-actions">
            {/* onClick: quando o botão é clicado, executa ambas as funções de refetch */}
            {/* A arrow function () => {} é necessária para chamar as funções ao clicar */}
            <button className="app__refresh-btn" onClick={() => { refetch(); refetchMetrics(); }} title="Atualizar dados">
              🔄 Atualizar
            </button>
          </div>
        </div>
      </header>

      {/* ─── CONTEÚDO PRINCIPAL ─── */}
      <main className="app__main">

        {/* Mensagem de erro (só aparece se "error" não for null/undefined) */}
        {/* O operador && funciona assim: se error for truthy, mostra o que vem a seguir */}
        {error && (
          <div className="app__error">
            <p>⚠️ Erro: {error}</p>
            <button onClick={refetch}>Tentar novamente</button>
          </div>
        )}

        {/* 
         * ─── PAINEL DE MÉTRICAS (RF-05) ───
         * Exibe totais, lucros, perdas e distribuição de risco.
         * Passa as "props" metrics e loading ao componente MetricsPanel.
         * Props são como argumentos que enviamos a um componente filho.
         */}
        <section className="app__section">
          <MetricsPanel metrics={metrics} loading={metricsLoading} />
        </section>

        {/* 
         * ─── FILTROS (RF-04) ───
         * O utilizador pode filtrar por desporto, valor, risco, data, etc.
         * onFilterChange e onClear são "callbacks" - funções que o componente filho
         * vai chamar quando o utilizador interagir com os filtros.
         */}
        <section className="app__section">
          <Filters filters={filters} onFilterChange={updateFilters} onClear={clearFilters} />
        </section>

        {/* 
         * ─── TABELA DE APOSTAS (RF-01) + PAGINAÇÃO (RF-03) ───
         * BetsTable: mostra os dados das apostas em formato de tabela
         * Pagination: botões para navegar entre páginas de resultados
         */}
        <section className="app__section">
          <BetsTable
            bets={bets}              // Os dados das apostas a mostrar
            sortBy={sortBy}          // Coluna atualmente ordenada
            sortOrder={sortOrder}    // Direção da ordenação
            onSort={handleSort}      // Callback quando o user clica numa coluna
            loading={loading}        // Se está a carregar dados
          />
          <Pagination
            pagination={pagination}      // Info de paginação (página, total, etc.)
            onPageChange={setPage}       // Callback quando muda de página
            onLimitChange={setLimit}     // Callback quando muda itens por página
          />
        </section>
      </main>

      {/* 
       * ─── CHAT COM ASSISTENTE IA (RF-06) ───
       * Componente flutuante de chat. Passa a função updateFilters
       * para que o assistente possa aplicar filtros via linguagem natural (futuro).
       */}
      <Chat onApplyFilters={updateFilters} />

      {/* ─── FOOTER (Rodapé) ─── */}
      <footer className="app__footer">
        <p>
          Blip Risk Analysis — UTAD — Engenharia Informática — 2026
        </p>
      </footer>
    </div>
  );
}

// "export default" torna este componente disponível para ser importado noutros ficheiros
// É assim que o main.jsx consegue fazer: import App from './App.jsx'
export default App;
