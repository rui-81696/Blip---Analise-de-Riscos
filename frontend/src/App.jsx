/*
 * ===== App.jsx =====
 * COMPONENTE PRINCIPAL da aplicação.
 *
 * Junta todos os componentes (tabela, filtros, métricas, chat),
 * gere o estado global (dados, filtros, paginação),
 * e mantém ligação WebSocket para receber apostas em tempo real.
 */

import { useEffect } from 'react';
import { useBets, useMetrics, useLiveBets } from './hooks/useBets';

import BetsTable from './components/BetsTable/BetsTable';
import Pagination from './components/Pagination/Pagination';
import Filters from './components/Filters/Filters';
import MetricsPanel from './components/MetricsPanel/MetricsPanel';
import Chat from './components/Chat/Chat';

import './App.scss';

const POLLING_INTERVAL = 30000;

/**
 * Componente principal da aplicação Blip - Risk Analysis
 * Esta é uma "function component" - a forma moderna de criar componentes em React
 */
function App() {
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

  const { metrics, loading: metricsLoading, refetch: refetchMetrics } = useMetrics();

  // WebSocket: receber apostas em tempo real
  const { connected, totalReceived } = useLiveBets();

  // Polling: atualizar dados periodicamente (complementa WebSocket)
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      refetchMetrics();
    }, POLLING_INTERVAL);

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
   * - Comentários JSX: {/* texto * /}  (sem espaço antes do /)
   *
   * "&&" (short-circuit): renderiza o elemento APENAS se a condição for true
   * Ex: {error && <div>...</div>} → só mostra o erro se "error" não for null
   */

  return (
    <div className="app">

      {/* Header */}
      <header className="app__header">
        <div className="app__header-content">
          <div className="app__logo">
            <span className="app__logo-icon">B</span>
            <div className="app__logo-text">
              <h1 className="app__title">Blip</h1>
              <span className="app__subtitle">Risk Analysis</span>
            </div>
          </div>
          <div className="app__header-actions">
            <span className={`app__live-indicator ${connected ? 'app__live-indicator--online' : 'app__live-indicator--offline'}`}>
              {connected ? '🟢 Online' : '🔴 Offline'}
              {connected && totalReceived > 0 && ` · ${totalReceived} novas`}
            </span>
            <button className="app__refresh-btn" onClick={() => { refetch(); refetchMetrics(); }} title="Atualizar dados">
              🔄 Atualizar
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="app__main">

        {error && (
          <div className="app__error">
            <p>⚠️ Erro: {error}</p>
            <button onClick={refetch}>Tentar novamente</button>
          </div>
        )}

        {/* Métricas de risco */}
        <section className="app__section">
          <MetricsPanel metrics={metrics} loading={metricsLoading} />
        </section>

        {/* Filtros */}
        <section className="app__section">
          <Filters filters={filters} onFilterChange={updateFilters} onClear={clearFilters} />
        </section>

        {/* Tabela de apostas + paginação */}
        <section className="app__section">
          <BetsTable
            bets={bets}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSort={handleSort}
            loading={loading}
          />
          <Pagination
            pagination={pagination}
            onPageChange={setPage}
            onLimitChange={setLimit}
          />
        </section>
      </main>

      {/* Chat IA */}
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
