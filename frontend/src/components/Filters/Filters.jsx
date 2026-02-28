/*
 * ===== Filters.jsx =====
 * COMPONENTE: Painel de Filtros
 *
 * Permite ao utilizador filtrar as apostas por:
 * - Pesquisa geral (texto livre)
 * - Desporto (dropdown/select)
 * - Estado (dropdown/select)
 * - Intervalo de valor (mín/máx em €)
 * - Intervalo de risco (mín/máx 0-100)
 * - Intervalo de datas (de/até)
 *
 * CONCEITO IMPORTANTE - Estado local vs Estado global:
 * Este componente tem o seu PRÓPRIO estado local (localFilters) para guardar
 * o que o user está a preencher. Só quando clica "Aplicar" é que os filtros
 * são enviados ao componente pai (App.jsx) via callback onFilterChange.
 * Isto evita que cada letra que o user escreve dispare um pedido à API.
 *
 * CONCEITO: Inputs controlados (Controlled Components)
 * Em React, os inputs são "controlados": o valor exibido vem do estado,
 * e quando o user escreve, o onChange atualiza o estado, que redesenha o input.
 * Fluxo: User escreve → onChange → setLocalFilters → React redesenha → input mostra novo valor
 */

// useState para gerir o estado local dos filtros
import { useState } from 'react';

// Função de tradução de desportos (inglês → português)
import { translateSport } from '../../utils/formatters';

// Estilos específicos deste componente
import './Filters.scss';

// ─── CONSTANTES ───
// Arrays com os valores possíveis para os dropdowns (selects)
const SPORTS = ['football', 'basketball', 'tennis', 'hockey', 'baseball', 'volleyball'];
const STATUSES = ['pending', 'won', 'lost', 'void'];
// Dicionário de tradução dos estados para o dropdown
const STATUS_LABELS = { pending: 'Pendente', won: 'Ganhou', lost: 'Perdeu', void: 'Anulada' };

/**
 * Componente Filters
 *
 * Props:
 * @param {object} filters - Filtros ativos vindos do componente pai
 * @param {function} onFilterChange - Callback para aplicar filtros (envia para App.jsx)
 * @param {function} onClear - Callback para limpar filtros
 */
export default function Filters({ filters, onFilterChange, onClear }) {
  /*
   * Estado LOCAL dos filtros.
   * É inicializado com os filtros vindos do pai (se existirem) ou strings vazias.
   * filters.sport || '' significa: usa filters.sport SE existir, senão usa string vazia.
   */
  const [localFilters, setLocalFilters] = useState({
    sport: filters.sport || '',
    status: filters.status || '',
    minAmount: filters.minAmount || '',
    maxAmount: filters.maxAmount || '',
    minRisk: filters.minRisk || '',
    maxRisk: filters.maxRisk || '',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    search: filters.search || '',
  });

  /**
   * Atualiza um campo específico no estado local dos filtros.
   * Usa "computed property names" [key] para definir o nome da propriedade dinamicamente.
   * Ex: handleChange('sport', 'football') → { ...prev, sport: 'football' }
   */
  const handleChange = (key, value) => {
    setLocalFilters((prev) => ({ ...prev, [key]: value }));
  };

  /**
   * Quando o user clica "Aplicar":
   * 1. Percorre todos os filtros locais
   * 2. Remove os que estão vazios (não faz sentido enviar sport: '' à API)
   * 3. Envia os filtros "limpos" ao componente pai via callback
   */
  const handleApply = () => {
    const cleanFilters = {};
    Object.entries(localFilters).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) {
        cleanFilters[key] = value;
      }
    });
    onFilterChange(cleanFilters); // Envia ao App.jsx que dispara nova busca à API
  };

  /**
   * Quando o user clica "Limpar":
   * 1. Reseta todos os campos locais para strings vazias
   * 2. Chama onClear() do pai para limpar os filtros no estado global
   */
  const handleClear = () => {
    setLocalFilters({
      sport: '',
      status: '',
      minAmount: '',
      maxAmount: '',
      minRisk: '',
      maxRisk: '',
      dateFrom: '',
      dateTo: '',
      search: '',
    });
    onClear(); // Comunica ao App.jsx
  };

  /**
   * Permite aplicar filtros com a tecla Enter (para rapidez)
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleApply();
  };

  return (
    <div className="filters">
      {/* ─── CABEÇALHO: Título + Botões ─── */}
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

      {/* ─── GRELHA DE CAMPOS ─── */}
      {/* CSS Grid: os campos distribuem-se automaticamente em colunas */}
      <div className="filters__grid">

        {/* Campo de pesquisa geral (ocupa toda a largura: --full) */}
        <div className="filters__field filters__field--full">
          <label className="filters__label">Pesquisa</label>
          {/*
           * Input controlado pelo React:
           * - value: o que aparece no input (vem do estado)
           * - onChange: quando o user escreve, atualiza o estado
           * - e.target.value: o novo valor do input (o que o user escreveu)
           */}
          <input
            className="filters__input"
            type="text"
            placeholder="Pesquisar por utilizador, evento, desporto..."
            value={localFilters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Dropdown para selecionar o desporto */}
        <div className="filters__field">
          <label className="filters__label">Desporto</label>
          {/*
           * <select> é um dropdown HTML.
           * Funciona como input controlado (value + onChange).
           * .map() cria uma <option> para cada desporto no array SPORTS.
           */}
          <select
            className="filters__select"
            value={localFilters.sport}
            onChange={(e) => handleChange('sport', e.target.value)}
          >
            <option value="">Todos</option>
            {SPORTS.map((s) => (
              <option key={s} value={s}>
                {translateSport(s)} {/* Mostra "Futebol" em vez de "football" */}
              </option>
            ))}
          </select>
        </div>

        {/* Dropdown para selecionar o estado */}
        <div className="filters__field">
          <label className="filters__label">Estado</label>
          <select
            className="filters__select"
            value={localFilters.status}
            onChange={(e) => handleChange('status', e.target.value)}
          >
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]} {/* Mostra "Pendente" em vez de "pending" */}
              </option>
            ))}
          </select>
        </div>

        {/* Campos numéricos para intervalo de valor (€) */}
        <div className="filters__field">
          <label className="filters__label">Valor mínimo (€)</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            step="10"
            placeholder="0"
            value={localFilters.minAmount}
            onChange={(e) => handleChange('minAmount', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label">Valor máximo (€)</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            step="10"
            placeholder="10000"
            value={localFilters.maxAmount}
            onChange={(e) => handleChange('maxAmount', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Campos numéricos para intervalo de risco (0-100) */}
        <div className="filters__field">
          <label className="filters__label">Risco mínimo</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            max="100"
            placeholder="0"
            value={localFilters.minRisk}
            onChange={(e) => handleChange('minRisk', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label">Risco máximo</label>
          <input
            className="filters__input"
            type="number"
            min="0"
            max="100"
            placeholder="100"
            value={localFilters.maxRisk}
            onChange={(e) => handleChange('maxRisk', e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Campos de data (input type="date" abre um calendário nativo) */}
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
