/*
 * ===== MetricsPanel.jsx =====
 * COMPONENTE: Painel de Métricas Agregadas
 *
 * Exibe cards com estatísticas gerais das apostas:
 * - Total de apostas
 * - Volume total apostado (€)
 * - Lucro e perda totais
 * - Exposição ao risco
 * - Risco médio
 * - Distribuição por nível de risco (barras de progresso)
 *
 * CONCEITOS USADOS:
 * - Renderização condicional: mostra loading ou dados conforme o estado
 * - Arrays de objetos: os cards são definidos num array e renderizados com .map()
 * - Cálculos inline: percentagens calculadas diretamente no JSX
 * - Object.entries(): converte um objeto em array de pares [chave, valor]
 */

// Importar funções de formatação (moeda e números)
import { formatCurrency, formatNumber } from '../../utils/formatters';
import './MetricsPanel.scss';

/**
 * Componente MetricsPanel
 *
 * Props:
 * @param {object} metrics - Objeto com todas as métricas (vem da API)
 * @param {boolean} loading - Se as métricas estão a ser carregadas
 */
export default function MetricsPanel({ metrics, loading }) {
  // Se está a carregar OU não há métricas ainda, mostra mensagem de loading
  if (loading || !metrics) {
    return (
      <div className="metrics-panel">
        <div className="metrics-panel__loading">A carregar métricas...</div>
      </div>
    );
  }

  /*
   * ─── DEFINIÇÃO DOS CARDS ───
   * Cada card é um objeto com:
   * - label: texto descritivo
   * - value: valor formatado para exibição
   * - icon: emoji como ícone visual
   * - color: classe CSS para a cor da borda lateral
   *
   * O último card tem uma expressão ternária encadeada para escolher a cor
   * do risco médio: vermelho se >50, amarelo se >25, verde caso contrário.
   */
  const cards = [
    {
      label: 'Total de Apostas',
      value: formatNumber(metrics.totalBets),   // Ex: "1 500"
      icon: '🎰',
      color: 'info',     // Azul
    },
    {
      label: 'Volume Total',
      value: formatCurrency(metrics.totalAmount), // Ex: "500 000,00 €"
      icon: '💰',
      color: 'info',
    },
    {
      label: 'Lucro Total',
      value: formatCurrency(metrics.totalProfit),
      icon: '📈',
      color: 'success',  // Verde
    },
    {
      label: 'Perda Total',
      value: formatCurrency(metrics.totalLoss),
      icon: '📉',
      color: 'danger',   // Vermelho
    },
    {
      label: 'Exposição ao Risco',
      value: formatCurrency(metrics.riskExposure),
      icon: '⚠️',
      color: 'warning',  // Amarelo
    },
    {
      label: 'Risco Médio',
      value: `${metrics.avgRiskScore}/100`,      // Ex: "42/100"
      icon: '🎯',
      // Ternário encadeado: >50 = vermelho, >25 = amarelo, caso contrário = verde
      color: metrics.avgRiskScore > 50 ? 'danger' : metrics.avgRiskScore > 25 ? 'warning' : 'success',
    },
  ];

  return (
    <div className="metrics-panel">
      <h3 className="metrics-panel__title">Métricas de Risco</h3>

      {/* ─── GRELHA DE CARDS ─── */}
      {/* CSS Grid distribui os cards automaticamente em colunas responsive */}
      <div className="metrics-panel__grid">
        {/*
         * .map() transforma cada card do array num elemento JSX.
         * Usa o index como key (aceitável porque esta lista não muda de ordem).
         *
         * Template literal na className: metrics-panel__card--${card.color}
         * aplica a cor correta via CSS (ex: --success = borda verde).
         */}
        {cards.map((card, index) => (
          <div key={index} className={`metrics-panel__card metrics-panel__card--${card.color}`}>
            <div className="metrics-panel__card-icon">{card.icon}</div>
            <div className="metrics-panel__card-content">
              <span className="metrics-panel__card-value">{card.value}</span>
              <span className="metrics-panel__card-label">{card.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ─── DISTRIBUIÇÃO DE RISCO (barras de progresso) ─── */}
      {/* Só mostra se a distribuição existir nos dados (&&) */}
      {metrics.riskDistribution && (
        <div className="metrics-panel__distribution">
          <h4 className="metrics-panel__subtitle">Distribuição de Risco</h4>
          <div className="metrics-panel__bars">
            {/*
             * Object.entries(metrics.riskDistribution) converte:
             * { low: 100, medium: 200, high: 150, critical: 50 }
             * em:
             * [['low', 100], ['medium', 200], ['high', 150], ['critical', 50]]
             *
             * Depois .map() cria uma barra para cada nível com a percentagem calculada.
             */}
            {Object.entries(metrics.riskDistribution).map(([level, count]) => {
              // Calcular a percentagem que este nível representa do total
              const total = metrics.totalBets || 1; // || 1 evita divisão por zero
              const percentage = Math.round((count / total) * 100);

              // Dicionário para traduzir os níveis
              const labels = { low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico' };

              return (
                <div key={level} className="metrics-panel__bar-group">
                  {/* Cabeçalho da barra: label + contagem */}
                  <div className="metrics-panel__bar-header">
                    <span className={`metrics-panel__bar-label risk-badge risk-badge--${level}`}>
                      {labels[level]}
                    </span>
                    <span className="metrics-panel__bar-value">
                      {count} ({percentage}%)
                    </span>
                  </div>
                  {/* A barra de progresso em si */}
                  {/* O width é controlado inline via style={{ width: `${percentage}%` }} */}
                  <div className="metrics-panel__bar-track">
                    <div
                      className={`metrics-panel__bar-fill metrics-panel__bar-fill--${level}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
