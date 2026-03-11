/*
 * ===== api.js =====
 * Serviço de API - intermediário entre o frontend e o backend.
 * Contém todas as funções que fazem pedidos HTTP ao servidor.
 *
 * MODELO DE APOSTA (Bet):
 * { id, sport, event, betType, selection, odd, stake, createdAt }
 */

const API_BASE = '/api';

const api = {
  /**
   * Buscar apostas com paginação e filtros
   * Filtros: sport, event, betType, selection, minStake, maxStake, minOdd, maxOdd, dateFrom, dateTo, search
   */
  async getBets(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        query.append(key, value);
      }
    });
    const response = await fetch(`${API_BASE}/bets?${query.toString()}`);
    if (!response.ok) throw new Error('Erro ao carregar apostas');
    return response.json();
  },

  async getBetById(id) {
    const response = await fetch(`${API_BASE}/bets/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error('Aposta não encontrada');
    return response.json();
  },

  async getMetrics() {
    const response = await fetch(`${API_BASE}/metrics`);
    if (!response.ok) throw new Error('Erro ao carregar métricas');
    return response.json();
  },

  async getSports() {
    const response = await fetch(`${API_BASE}/bets/sports/list`);
    if (!response.ok) throw new Error('Erro ao carregar desportos');
    return response.json();
  },

  async getEvents(sport = '') {
    const query = sport ? `?sport=${encodeURIComponent(sport)}` : '';
    const response = await fetch(`${API_BASE}/bets/events/list${query}`);
    if (!response.ok) throw new Error('Erro ao carregar eventos');
    return response.json();
  },

  async getBetTypes() {
    const response = await fetch(`${API_BASE}/bets/bet-types/list`);
    if (!response.ok) throw new Error('Erro ao carregar tipos de aposta');
    return response.json();
  },

  async getSelections(event = '', betType = '') {
    const query = new URLSearchParams();
    if (event) query.append('event', event);
    if (betType) query.append('betType', betType);
    const qs = query.toString();
    const response = await fetch(`${API_BASE}/bets/selections/list${qs ? '?' + qs : ''}`);
    if (!response.ok) throw new Error('Erro ao carregar seleções');
    return response.json();
  },

  async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('API indisponível');
    return response.json();
  },
};

export default api;
