/*
 * ===== Filters.jsx =====
 * COMPONENTE: Painel de Filtros
 *
 * Permite filtrar apostas por:
 * - Pesquisa geral (texto livre)
 * - Desporto, Tipo de aposta (dropdowns)
 * - Intervalo de stake (€) e odds
 * - Intervalo de datas
 *
 * Os filtros são locais até o utilizador clicar "Aplicar".
 */

import { useState } from 'react';
import { translateSport, translateBetType } from '../../utils/formatters';
import './Filters.scss';

const SPORTS = ['Football', 'Basketball', 'Tennis', 'Hockey', 'Baseball', 'Volleyball'];
const BET_TYPES = ['Win', 'Over/Under', 'Both Teams to Score', 'Handicap'];

export default function Filters({ filters, onFilterChange, onClear }) {
  const [localFilters, setLocalFilters] = useState({
    sport: filters.sport || '',
    betType: filters.betType || '',
    selection: filters.selection || '',
    minStake: filters.minStake || '',
    maxStake: filters.maxStake || '',
    minOdd: filters.minOdd || '',
    maxOdd: filters.maxOdd || '',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    search: filters.search || '',
  });

  const handleChange = (key, value) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    const cleanFilters = {};
    Object.entries(localFilters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        cleanFilters[key] = value;
      }
    });
    onFilterChange(cleanFilters);
  };

  const handleClear = () => {
    setLocalFilters({
      sport: '',
      betType: '',
      selection: '',
      minStake: '',
      maxStake: '',
      minOdd: '',
      maxOdd: '',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
    onClear();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply();
  };

  return (
    <div className="filters">
      <div className="filters__header">
        <h3 className="filters__title">Filtros</h3>
        <div className="filters__actions">
          <button className="filters__btn filters__btn--apply" onClick={handleApply}>
            Aplicar
          </button>
          <button className="filters__btn filters__btn--clear" onClick={handleClear}>
            Limpar
          </button>
        </div>
      </div>

      <div className="filters__grid">
        {/* Pesquisa geral */}
        <div className="filters__field filters__field--full">
          <label className="filters__label">Pesquisa</label>
          <input
            className="filters__input"
            type="text"
            placeholder="Pesquisar por evento, seleção, desporto..."
            value={localFilters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Desporto */}
        <div className="filters__field">
          <label className="filters__label">Desporto</label>
          <select
            className="filters__select"
            value={localFilters.sport}
            onChange={(e) => handleChange('sport', e.target.value)}
          >
            <option value="">Todos</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {translateSport(s)}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de aposta */}
        <div className="filters__field">
          <label className="filters__label">Tipo de Aposta</label>
          <select
            className="filters__select"
            value={localFilters.betType}
            onChange={(e) => handleChange('betType', e.target.value)}
          >
            <option value="">Todos</option>
            {BET_TYPES.map((t) => (
              <option key={t} value={t}>
                {translateBetType(t)}
              </option>
            ))}
          </select>
        </div>

        {/* Seleção (texto) */}
        <div className="filters__field">
          <label className="filters__label">Seleção</label>
          <input
            className="filters__input"
            type="text"
            placeholder="Ex: Manchester United to Win"
            value={localFilters.selection}
            onChange={(e) => handleChange('selection', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Stake mín/máx */}
        <div className="filters__field">
          <label className="filters__label">Stake mínima (€)</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            step="10"
            placeholder="0"
            value={localFilters.minStake}
            onChange={(e) => handleChange('minStake', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label">Stake máxima (€)</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            step="10"
            placeholder="10000"
            value={localFilters.maxStake}
            onChange={(e) => handleChange('maxStake', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Odds mín/máx */}
        <div className="filters__field">
          <label className="filters__label">Odd mínima</label>
          <input
            className="filters__input"
            type="number"
            min="1"
            max="4"
            step="0.1"
            placeholder="1.0"
            value={localFilters.minOdd}
            onChange={(e) => handleChange('minOdd', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label">Odd máxima</label>
          <input
            className="filters__input"
            type="number"
            min="1"
            max="4"
            step="0.1"
            placeholder="4.0"
            value={localFilters.maxOdd}
            onChange={(e) => handleChange('maxOdd', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Datas */}
        <div className="filters__field">
          <label className="filters__label">Data início</label>
          <input
            className="filters__input"
            type="date"
            value={localFilters.dateFrom}
            onChange={(e) => handleChange('dateFrom', e.target.value)}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label">Data fim</label>
          <input
            className="filters__input"
            type="date"
            value={localFilters.dateTo}
            onChange={(e) => handleChange('dateTo', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
