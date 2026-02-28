/*
 * ===== api.js =====
 * Este ficheiro é o "serviço de API" - é o intermediário entre o frontend e o backend.
 * Contém todas as funções que fazem pedidos HTTP ao servidor backend.
 *
 * CONCEITOS IMPORTANTES:
 * - fetch(): função nativa do browser para fazer pedidos HTTP (GET, POST, etc.)
 * - async/await: forma moderna de lidar com operações assíncronas (que demoram tempo)
 *   "async" marca a função como assíncrona, "await" espera pelo resultado
 * - Promise: um objeto que representa o resultado futuro de uma operação
 * - URLSearchParams: classe que ajuda a construir query strings (ex: ?page=1&limit=20)
 *
 * O que é uma API?
 * Uma API (Application Programming Interface) é um conjunto de URLs (endpoints)
 * que o servidor disponibiliza para que o frontend possa pedir e enviar dados.
 * Ex: GET /api/bets → devolve a lista de apostas
 */

// URL base da API - '/api' porque o Vite redireciona para http://localhost:3001/api
// (ver vite.config.js, secção "proxy")
const API_BASE = '/api';

/**
 * Objeto que contém todos os métodos para comunicar com o backend.
 * Cada método é uma função async que faz um pedido HTTP.
 */
const api = {
  /**
   * Buscar apostas com paginação e filtros (RF-09)
   * Faz um GET a /api/bets com os parâmetros na query string
   *
   * @param {object} params - Parâmetros de query (ex: { page: 1, limit: 20, sport: 'football' })
   * @returns {Promise<object>} Resposta com { data: [...apostas], pagination: {...}, filters: {...} }
   *
   * Exemplo de URL gerada: /api/bets?page=1&limit=20&sport=football
   */
  async getBets(params = {}) {
    // URLSearchParams converte um objeto em query string
    // Ex: { page: 1, limit: 20 } → "page=1&limit=20"
    const query = new URLSearchParams();

    // Object.entries converte o objeto em array de pares [chave, valor]
    // forEach itera por cada par e adiciona à query string
    // Ignora valores vazios, null ou undefined (não faz sentido enviá-los)
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined && value !== '') {
        query.append(key, value);
      }
    });

    // fetch faz o pedido HTTP GET ao servidor
    // await espera pela resposta (porque é uma operação que demora)
    const response = await fetch(`${API_BASE}/bets?${query.toString()}`);

    // Se o servidor respondeu com erro (status 4xx ou 5xx), lançar um erro
    if (!response.ok) throw new Error('Erro ao carregar apostas');

    // .json() converte a resposta (texto JSON) em objeto JavaScript
    return response.json();
  },

  /**
   * Buscar o detalhe de uma aposta específica pelo seu ID
   *
   * @param {string} id - UUID (identificador único) da aposta
   * @returns {Promise<object>} { data: { id, userId, sport, event, amount, ... } }
   */
  async getBetById(id) {
    const response = await fetch(`${API_BASE}/bets/${id}`);
    if (!response.ok) throw new Error('Aposta não encontrada');
    return response.json();
  },

  /**
   * Buscar métricas agregadas (RF-10)
   * Devolve totais, médias, distribuição de risco, etc.
   *
   * @returns {Promise<object>} Objeto com métricas (totalBets, totalAmount, etc.)
   */
  async getMetrics() {
    const response = await fetch(`${API_BASE}/metrics`);
    if (!response.ok) throw new Error('Erro ao carregar métricas');
    return response.json();
  },

  /**
   * Buscar lista de desportos disponíveis na base de dados
   *
   * @returns {Promise<object>} { data: ['football', 'basketball', ...] }
   */
  async getSports() {
    const response = await fetch(`${API_BASE}/bets/sports/list`);
    if (!response.ok) throw new Error('Erro ao carregar desportos');
    return response.json();
  },

  /**
   * Buscar lista de eventos disponíveis
   *
   * @param {string} sport - Nome do desporto para filtrar (opcional)
   * @returns {Promise<object>} { data: ['SL Benfica vs FC Porto', ...] }
   */
  async getEvents(sport = '') {
    // Se um desporto foi especificado, adiciona-o como query parameter
    const query = sport ? `?sport=${sport}` : '';
    const response = await fetch(`${API_BASE}/bets/events/list${query}`);
    if (!response.ok) throw new Error('Erro ao carregar eventos');
    return response.json();
  },

  /**
   * Health check (verificação de saúde) da API
   * Útil para verificar se o servidor está a funcionar
   *
   * @returns {Promise<object>} { status: 'ok', timestamp: '...' }
   */
  async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('API indisponível');
    return response.json();
  },
};

// Exportar o objeto api para que outros ficheiros o possam usar
// Ex: import api from '../services/api'; api.getBets(...)
export default api;
