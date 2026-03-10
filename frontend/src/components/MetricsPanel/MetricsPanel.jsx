/*
 * ===== MetricsPanel.jsx =====
 * COMPONENTE: Painel de Métricas Agregadas
 *
 * Exibe cards com estatísticas gerais das apostas:
 * - Total de apostas
 * - Volume total apostado (€)
 * - Lucro e perda totais (CLICÁVEIS)
 * - Apostas encerradas
 * - Exposição ao risco
 * - Risco médio
 * - Distribuição por nível de risco (barras de progresso)
 *
 * CONCEITOS USADOS:
 * - Renderização condicional: mostra loading ou dados conforme o estado
 * - Arrays de objetos: os cards são definidos num array e renderizados com .map()
 * - Cálculos inline: percentagens calculadas diretamente no JSX
 * - Object.entries(): converte um objeto em array de pares [chave, valor]
 * - useState: gerencia estado do modal (aberto/fechado)
 */

import { useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import ProfitLossModal from '../ProfitLossModal/ProfitLossModal';
import './MetricsPanel.scss';

// Registar componentes Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

/**
 * Componente MetricsPanel
 *
 * Props:
 * @param {object} metrics - Objeto com todas as métricas (vem da API)
 * @param {boolean} loading - Se as métricas estão a ser carregadas
 */
export default function MetricsPanel({ metrics, loading }) {
  // Estado para controlar qual modal está aberto (null, 'profit', ou 'loss')
  const [modalOpen, setModalOpen] = useState(null);

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
   * Cada card é um objeto com propriedades para renderização e interação.
   * Novos campos:
   * - clickable: se o card é clicável (true para lucro/perda)
   * - onClick: função a executar quando clicado
   */
  const primaryCards = [
    {
      label: 'Total de Apostas',
      value: formatNumber(metrics.totalBets),
      subtext: 'Todas as apostas',
      icon: '🎲',
      color: 'info',
      clickable: false,
    },
    {
      label: 'Apostas Encerradas',
      value: formatNumber(metrics.closedBets || 0),
      subtext: `${metrics.closedWithProfit || 0} ganhas, ${metrics.closedWithLoss || 0} perdidas`,
      icon: '✅',
      color: 'info',
      clickable: false,
    },
    {
      label: 'Volume Total',
      value: formatCurrency(metrics.totalAmount),
      subtext: 'Valor apostado',
      icon: '💰',
      color: 'info',
      clickable: false,
    },
  ];

  const profitLossCards = [
    {
      label: 'Lucro Total',
      value: formatCurrency(metrics.totalProfit),
      subtext: `Taxa vitória: ${metrics.winRate || 0}%`,
      icon: '📈',
      color: 'success',
      clickable: true,
      onClick: () => setModalOpen('profit'),
    },
    {
      label: 'Perda Total',
      value: formatCurrency(metrics.totalLoss),
      subtext: `Média por derrota: €${(metrics.avgLoss || 0).toFixed(2)}`,
      icon: '📉',
      color: 'danger',
      clickable: true,
      onClick: () => setModalOpen('loss'),
    },
  ];

  const riskCards = [
    {
      label: 'Exposição ao Risco',
      value: formatCurrency(metrics.riskExposure),
      subtext: `${metrics.byStatus?.pending?.count || 0} apostas pendentes`,
      icon: '⚠️',
      color: 'warning',
      clickable: false,
    },
    {
      label: 'Risco Médio',
      value: `${Math.round(metrics.avgRiskScore)}/100`,
      subtext: metrics.avgRiskScore > 50 ? 'Risco Alto ⚠️' : metrics.avgRiskScore > 25 ? 'Risco Médio' : 'Risco Baixo ✓',
      icon: '🎯',
      color: metrics.avgRiskScore > 50 ? 'danger' : metrics.avgRiskScore > 25 ? 'warning' : 'success',
      clickable: false,
    },
  ];

  // Renderizar um card individual
  const renderCard = (card, index) => (
    <div
      key={index}
      className={`metrics-panel__card metrics-panel__card--${card.color} ${card.clickable ? 'metrics-panel__card--clickable' : ''}`}
      onClick={card.onClick}
      role={card.clickable ? 'button' : undefined}
      tabIndex={card.clickable ? 0 : undefined}
    >
      <div className="metrics-panel__card-icon">{card.icon}</div>
      <div className="metrics-panel__card-content">
        <span className="metrics-panel__card-label">{card.label}</span>
        <span className="metrics-panel__card-value">{card.value}</span>
        <span className="metrics-panel__card-subtext">{card.subtext}</span>
      </div>
      {card.clickable && <div className="metrics-panel__card-hint">Clica para detalhes →</div>}
    </div>
  );

  // Dados para o gráfico de lucro
  const profitChartData = {
    labels: ['Lucro', 'Apostado'],
    datasets: [
      {
        data: [
          Math.max(0, metrics.totalProfit),
          Math.max(0, metrics.totalAmount - Math.max(0, metrics.totalProfit))
        ],
        backgroundColor: ['rgba(46, 204, 113, 0.7)', 'rgba(46, 204, 113, 0.2)'],
        borderColor: ['#2ecc71', '#2ecc71'],
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  // Dados para o gráfico de perda
  const lossChartData = {
    labels: ['Perda', 'Apostado'],
    datasets: [
      {
        data: [
          Math.max(0, metrics.totalLoss),
          Math.max(0, metrics.totalAmount - Math.max(0, metrics.totalLoss))
        ],
        backgroundColor: ['rgba(231, 76, 60, 0.7)', 'rgba(231, 76, 60, 0.2)'],
        borderColor: ['#e74c3c', '#e74c3c'],
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  // Opções comuns para os gráficos
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#a0a0b0',
          padding: 15,
          font: {
            size: 12,
            weight: 500,
          },
        },
      },
      tooltip: {
        backgroundColor: 'rgba(31, 31, 47, 0.95)',
        titleColor: '#eaeaea',
        bodyColor: '#eaeaea',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: function(context) {
            return formatCurrency(context.parsed);
          },
        },
      },
    },
  };

  return (
    <>
      <div className="metrics-panel">
        <h3 className="metrics-panel__title">Métricas de Risco</h3>

        {/* ─── SECÇÃO 1: CARDS PRINCIPAIS ─── */}
        <div className="metrics-panel__section">
          <h4 className="metrics-panel__section-title">Visão Geral</h4>
          <div className="metrics-panel__grid">
            {primaryCards.map((card, index) => renderCard(card, index))}
          </div>
        </div>

        {/* ─── SECÇÃO 2: LUCRO E PERDA (CLICÁVEL) ─── */}
        <div className="metrics-panel__section">
          <h4 className="metrics-panel__section-title">Resultados Financeiros</h4>
          <div className="metrics-panel__grid metrics-panel__grid--2col">
            {profitLossCards.map((card, index) => renderCard(card, index))}
          </div>

          {/* Gráficos de Lucro e Perda */}
          <div className="metrics-panel__charts">
            <div className="metrics-panel__chart-container">
              <h5 className="metrics-panel__chart-title">Evolução de Lucros</h5>
              <div className="metrics-panel__chart-box metrics-panel__chart-box--success">
                <Doughnut data={profitChartData} options={chartOptions} />
              </div>
            </div>
            <div className="metrics-panel__chart-container">
              <h5 className="metrics-panel__chart-title">Evolução de Perdas</h5>
              <div className="metrics-panel__chart-box metrics-panel__chart-box--danger">
                <Doughnut data={lossChartData} options={chartOptions} />
              </div>
            </div>
          </div>
        </div>

        {/* ─── SECÇÃO 3: RISCO ─── */}
        <div className="metrics-panel__section">
          <h4 className="metrics-panel__section-title">Análise de Risco</h4>
          <div className="metrics-panel__grid metrics-panel__grid--2col">
            {riskCards.map((card, index) => renderCard(card, index))}
          </div>
        </div>

        {/* ─── DISTRIBUIÇÃO DE RISCO (barras de progresso) ─── */}
        {metrics.riskDistribution && (
          <div className="metrics-panel__distribution">
            <h4 className="metrics-panel__subtitle">Distribuição por Nível de Risco</h4>
            <div className="metrics-panel__bars">
              {Object.entries(metrics.riskDistribution).map(([level, count]) => {
                const total = metrics.totalBets || 1;
                const percentage = Math.round((count / total) * 100);
                const labels = { low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico' };

                return (
                  <div key={level} className="metrics-panel__bar-group">
                    <div className="metrics-panel__bar-header">
                      <span className={`metrics-panel__bar-label risk-badge risk-badge--${level}`}>
                        {labels[level]}
                      </span>
                      <span className="metrics-panel__bar-value">
                        {count} ({percentage}%)
                      </span>
                    </div>
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

      {/* Modal de Lucro/Perda */}
      <ProfitLossModal
        isOpen={modalOpen === 'profit'}
        onClose={() => setModalOpen(null)}
        type="profit"
        metrics={metrics}
      />
      <ProfitLossModal
        isOpen={modalOpen === 'loss'}
        onClose={() => setModalOpen(null)}
        type="loss"
        metrics={metrics}
      />
    </>
  );
}
