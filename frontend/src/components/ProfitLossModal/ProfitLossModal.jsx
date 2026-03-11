/*
 * ===== ProfitLossModal.jsx =====
 * COMPONENTE: Modal de Detalhe de Risco
 *
 * Mostra a lista completa de seleções ou eventos ordenados por exposição.
 * É aberto a partir do MetricsPanel quando o utilizador clica "Ver todas".
 */

import { formatCurrency, formatNumber, translateSport, translateBetType } from '../../utils/formatters';
import './ProfitLossModal.scss';

export default function ProfitLossModal({ isOpen, onClose, type = 'selections', metrics }) {
  if (!isOpen || !metrics) return null;

  const { bySelection, byEvent } = metrics;
  const title = type === 'selections'
    ? 'Todas as Seleções por Exposição'
    : 'Todos os Eventos por Exposição';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {type === 'selections' && bySelection && (
            <table className="modal-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Seleção</th>
                  <th>Evento</th>
                  <th>Desporto</th>
                  <th>Tipo</th>
                  <th>Apostas</th>
                  <th>Total Apostado</th>
                  <th>Odd Média</th>
                  <th>Exposição</th>
                </tr>
              </thead>
              <tbody>
                {bySelection.map((sel, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{sel.selection}</td>
                    <td>{sel.event}</td>
                    <td>{translateSport(sel.sport)}</td>
                    <td>{translateBetType(sel.betType)}</td>
                    <td>{formatNumber(sel.count)}</td>
                    <td>{formatCurrency(sel.totalStake)}</td>
                    <td>{sel.avgOdd?.toFixed(2)}</td>
                    <td className="modal-table__loss">{formatCurrency(sel.potentialLoss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {type === 'events' && byEvent && (
            <table className="modal-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Evento</th>
                  <th>Desporto</th>
                  <th>Seleções</th>
                  <th>Apostas</th>
                  <th>Total Apostado</th>
                  <th>Exposição</th>
                </tr>
              </thead>
              <tbody>
                {byEvent.map((ev, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{ev.event}</td>
                    <td>{translateSport(ev.sport)}</td>
                    <td>{ev.selectionsCount}</td>
                    <td>{formatNumber(ev.count)}</td>
                    <td>{formatCurrency(ev.totalStake)}</td>
                    <td className="modal-table__loss">{formatCurrency(ev.potentialLoss)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
