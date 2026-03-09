import React, { useState, useEffect } from 'react';
import './ProfitLossModal.scss';

/**
 * Componente ProfitLossModal
 * 
 * Mostra um modal com estatísticas detalhadas de ganhos/perdas
 * Inclui gráficos visuais e informações da distribuição de ganhos/perdas
 */
export default function ProfitLossModal({ 
  isOpen, 
  onClose, 
  type = 'profit', // 'profit' ou 'loss'
  metrics 
}) {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    if (isOpen && metrics) {
      // Simular dados para visualização
      // Em produção, viria da API com distribuição real de ganhos/perdas
      if (type === 'profit') {
        setChartData([
          { range: '€0-100', count: 5, percentage: 15 },
          { range: '€100-250', count: 8, percentage: 25 },
          { range: '€250-500', count: 12, percentage: 35 },
          { range: '€500+', count: 10, percentage: 25 },
        ]);
      } else {
        setChartData([
          { range: '€0-100', count: 8, percentage: 20 },
          { range: '€100-250', count: 15, percentage: 30 },
          { range: '€250-500', count: 12, percentage: 35 },
          { range: '€500+', count: 5, percentage: 15 },
        ]);
      }
    }
  }, [isOpen, type, metrics]);

  if (!isOpen) return null;

  const backgroundColor = type === 'profit' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
  const borderColor = type === 'profit' ? '#22c55e' : '#ef4444';
  const badgeClass = type === 'profit' ? 'success' : 'danger';
  const title = type === 'profit' ? 'Distribuição de Ganhos' : 'Distribuição de Perdas';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Resumo de estatísticas */}
          <div className="summary-cards">
            <div className={`summary-card summary-card--${badgeClass}`}>
              <div className="summary-label">Total de {type === 'profit' ? 'Ganhos' : 'Perdas'}</div>
              <div className="summary-value">
                €{type === 'profit' ? metrics.totalProfit?.toFixed(2) : metrics.totalLoss?.toFixed(2)}
              </div>
            </div>
            <div className={`summary-card summary-card--${badgeClass}`}>
              <div className="summary-label">Número de Apostas</div>
              <div className="summary-value">
                {type === 'profit' ? metrics.closedWithProfit : metrics.closedWithLoss}
              </div>
            </div>
            <div className={`summary-card summary-card--${badgeClass}`}>
              <div className="summary-label">Média por Aposta</div>
              <div className="summary-value">
                €{type === 'profit' ? metrics.avgProfit?.toFixed(2) : metrics.avgLoss?.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Gráfico de barras - distribuição por intervalo */}
          <div className="chart-container">
            <h3>Distribuição por Intervalo</h3>
            <div className="bar-chart">
              {chartData.map((item, index) => (
                <div key={index} className="bar-item">
                  <div className="bar-label">{item.range}</div>
                  <div className="bar-wrapper">
                    <div
                      className={`bar-fill bar-fill--${badgeClass}`}
                      style={{ width: `${item.percentage}%` }}
                    >
                      <span className="bar-value">{item.count}</span>
                    </div>
                  </div>
                  <div className="bar-percentage">{item.percentage}%</div>
                </div>
              ))}
            </div>
          </div>

          {/* Gráfico de Pizza - proporção visual */}
          <div className="pie-container">
            <h3>Proporção de Apostas</h3>
            <svg viewBox="0 0 100 100" className="pie-chart">
              <circle cx="50" cy="50" r="45" fill="none" stroke={borderColor} strokeWidth="30" 
                      strokeDasharray={`${chartData.reduce((sum, item) => sum + item.percentage, 0) * 2.827} 282.7`}
                      strokeDashoffset="0" />
            </svg>
            <div className="pie-legend">
              {chartData.map((item, index) => (
                <div key={index} className="legend-item">
                  <span className={`legend-dot legend-dot--${badgeClass}`}></span>
                  <span>{item.range}: {item.count} apostas</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
