/*
 * ===== BetsTable.jsx =====
 * COMPONENTE: Tabela Interativa de Apostas
 *
 * Mostra as apostas numa tabela com ordenação por coluna.
 * MODELO DE APOSTA: { id, sport, event, betType, selection, odd, stake, createdAt }
 */

import { formatCurrency, formatDate, translateSport, translateBetType } from '../../utils/formatters';
import './BetsTable.scss';

/**
 * Props:
 * @param {Array} bets - Array de apostas
 * @param {string} sortBy - Coluna atualmente ordenada
 * @param {string} sortOrder - 'asc' ou 'desc'
 * @param {function} onSort - Callback quando se clica numa coluna
 * @param {boolean} loading - Se os dados estão a carregar
 */
export default function BetsTable({ bets, sortBy, sortOrder, onSort, loading }) {
  const columns = [
    { key: 'id', label: 'ID', sortable: false },
    { key: 'sport', label: 'Desporto', sortable: true },
    { key: 'event', label: 'Evento', sortable: true },
    { key: 'betType', label: 'Tipo', sortable: true },
    { key: 'selection', label: 'Seleção', sortable: true },
    { key: 'odd', label: 'Odd', sortable: true },
    { key: 'stake', label: 'Stake (€)', sortable: true },
    { key: 'createdAt', label: 'Data', sortable: true },
  ];

  const getSortIcon = (key) => {
    if (sortBy !== key) return '↕';
    return sortOrder === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="bets-table__loading">
        <div className="loading-spinner">
          <div className="loading-spinner__circle" />
        </div>
        <p>A carregar apostas...</p>
      </div>
    );
  }

  if (!bets || bets.length === 0) {
    return (
      <div className="bets-table__empty">
        <p>Nenhuma aposta encontrada.</p>
        <p className="text-muted">Ajuste os filtros ou aguarde novos dados.</p>
      </div>
    );
  }

  return (
    <div className="bets-table">
      <div className="bets-table__wrapper">
        <table className="bets-table__table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`bets-table__th ${col.sortable ? 'bets-table__th--sortable' : ''} ${
                    sortBy === col.key ? 'bets-table__th--active' : ''
                  }`}
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <span>{col.label}</span>
                  {col.sortable && (
                    <span className="bets-table__sort-icon">{getSortIcon(col.key)}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => (
              <tr key={bet.id} className="bets-table__row">
                <td className="bets-table__td bets-table__td--id">
                  <span title={bet.id}>{bet.id.slice(0, 8)}...</span>
                </td>
                <td className="bets-table__td">{translateSport(bet.sport)}</td>
                <td className="bets-table__td bets-table__td--event">{bet.event}</td>
                <td className="bets-table__td">
                  <span className="bet-type-badge">{translateBetType(bet.betType)}</span>
                </td>
                <td className="bets-table__td bets-table__td--selection">{bet.selection}</td>
                <td className="bets-table__td">{bet.odd.toFixed(2)}</td>
                <td className="bets-table__td bets-table__td--amount">
                  {formatCurrency(bet.stake)}
                </td>
                <td className="bets-table__td bets-table__td--date">
                  {formatDate(bet.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
