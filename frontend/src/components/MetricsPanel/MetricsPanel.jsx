/*
 * ===== MetricsPanel.jsx =====
 * COMPONENTE: Painel de Análise de Risco
 *
 * Exibe métricas agregadas de risco das apostas:
 * - Visão geral: total apostas, volume, exposição total, odd média
 * - Top seleções por exposição (potentialLoss = Σ stake × odd)
 * - Distribuição de risco por desporto (barras)
 *
 * DADOS RECEBIDOS (metrics):
 * {
 *   overview: { totalBets, totalStake, totalPotentialLoss, avgOdd, avgStake, uniqueEvents, uniqueSelections },
 *   bySelection: [{ selection, event, sport, betType, count, totalStake, avgOdd, potentialLoss, odds }],
 *   byEvent: [{ event, sport, count, totalStake, potentialLoss, selectionsCount }],
 *   bySport: { Football: { count, totalStake, potentialLoss }, ... }
 * }
 */

import { useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import { formatCurrency, formatNumber } from '../../utils/formatters';
import ProfitLossModal from '../ProfitLossModal/ProfitLossModal';
import './MetricsPanel.scss';

// Registar componentes Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

// Registar componentes Chart.js
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function MetricsPanel({ metrics, loading }) {
  const [modalOpen, setModalOpen] = useState(null);

  if (loading || !metrics) {
    return (
      <div className="metrics-panel">
        <div className="metrics-panel__loading">A carregar métricas...</div>
      </div>
    );
  }

  const { overview, bySelection, bySport } = metrics;

  // Cards de visão geral
  const overviewCards = [
    {
      label: 'Total de Apostas',
      value: formatNumber(overview.totalBets),
      subtext: `${overview.uniqueEvents} eventos · ${overview.uniqueSelections} seleções`,
      icon: '🎲',
      color: 'info',
    },
    {
      label: 'Volume Total Apostado',
      value: formatCurrency(overview.totalStake),
      subtext: `Média: ${formatCurrency(overview.avgStake)}/aposta`,
      icon: '💰',
      color: 'info',
    },
    {
      label: 'Exposição Total',
      value: formatCurrency(overview.totalPotentialLoss),
      subtext: 'Perda máxima (Σ stake × odd)',
      icon: '⚠️',
      color: 'danger',
    },
    {
      label: 'Odd Média',
      value: overview.avgOdd?.toFixed(2),
      subtext: 'Odds entre 1.1 e 4.0',
      icon: '📊',
      color: 'warning',
    },
  ];

  const renderCard = (card, index) => (
    <div key={index} className={`metrics-panel__card metrics-panel__card--${card.color}`}>
      <div className="metrics-panel__card-icon">{card.icon}</div>
      <div className="metrics-panel__card-content">
        <span className="metrics-panel__card-label">{card.label}</span>
        <span className="metrics-panel__card-value">{card.value}</span>
        <span className="metrics-panel__card-subtext">{card.subtext}</span>
      </div>
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
        <h3 className="metrics-panel__title">Análise de Risco</h3>

        {/* Visão Geral */}
        <div className="metrics-panel__section">
          <h4 className="metrics-panel__section-title">Visão Geral</h4>
          <div className="metrics-panel__grid">
            {overviewCards.map((card, index) => renderCard(card, index))}
          </div>
        </div>

        {/* Top seleções por exposição */}
        {bySelection && bySelection.length > 0 && (
          <div className="metrics-panel__section">
            <h4 className="metrics-panel__section-title">Maiores Exposições por Seleção</h4>
            <div className="metrics-panel__risk-table-wrapper">
              <table className="metrics-panel__risk-table">
                <thead>
                  <tr>
                    <th>Seleção</th>
                    <th>Evento</th>
                    <th>Tipo</th>
                    <th>Apostas</th>
                    <th>Total Apostado</th>
                    <th>Odd Média</th>
                    <th>Exposição</th>
                  </tr>
                </thead>
                <tbody>
                  {bySelection.slice(0, 10).map((sel, i) => (
                    <tr key={i} className={i < 3 ? 'metrics-panel__risk-table--highlight' : ''}>
                      <td className="metrics-panel__risk-table-selection">{sel.selection}</td>
                      <td>{sel.event}</td>
                      <td><span className="metrics-panel__badge">{translateBetType(sel.betType)}</span></td>
                      <td>{formatNumber(sel.count)}</td>
                      <td>{formatCurrency(sel.totalStake)}</td>
                      <td>{sel.avgOdd?.toFixed(2)}</td>
                      <td className="metrics-panel__risk-table-loss">{formatCurrency(sel.potentialLoss)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {bySelection.length > 10 && (
              <button
                className="metrics-panel__show-more"
                onClick={() => setModalOpen('selections')}
              >
                Ver todas as {bySelection.length} seleções →
              </button>
            )}
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

        {/* Risco por desporto */}
        {bySport && Object.keys(bySport).length > 0 && (
          <div className="metrics-panel__section">
            <h4 className="metrics-panel__section-title">Risco por Desporto</h4>
            <div className="metrics-panel__bars">
              {Object.entries(bySport)
                .sort(([, a], [, b]) => b.potentialLoss - a.potentialLoss)
                .map(([sport, data]) => {
                  const maxLoss = Math.max(...Object.values(bySport).map((d) => d.potentialLoss));
                  const percentage = Math.round((data.potentialLoss / maxLoss) * 100);
                  return (
                    <div key={sport} className="metrics-panel__bar-group">
                      <div className="metrics-panel__bar-header">
                        <span className="metrics-panel__bar-label">{translateSport(sport)}</span>
                        <span className="metrics-panel__bar-value">
                          {formatCurrency(data.potentialLoss)} · {formatNumber(data.count)} apostas
                        </span>
                      </div>
                      <div className="metrics-panel__bar-track">
                        <div
                          className="metrics-panel__bar-fill metrics-panel__bar-fill--sport"
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

      {/* Modal: lista completa de seleções */}
      <ProfitLossModal
        isOpen={modalOpen === 'selections'}
        onClose={() => setModalOpen(null)}
        type="selections"
        metrics={metrics}
      />
    </>
  );
}
