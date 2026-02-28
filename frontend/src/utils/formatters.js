/*
 * ===== formatters.js =====
 * Este ficheiro contém FUNÇÕES UTILITÁRIAS para formatar dados.
 * São funções "puras" (não alteram nada, só recebem um valor e devolvem outro).
 *
 * Usadas em vários componentes para:
 * - Converter risk scores em labels legíveis (ex: 75 → "Alto")
 * - Formatar valores monetários (ex: 1500 → "1 500,00 €")
 * - Formatar datas (ex: ISO string → "28/02/2026, 15:30")
 * - Traduzir termos de inglês para português
 *
 * CONCEITO IMPORTANTE - Intl (Internacionalização):
 * O JavaScript tem uma API chamada Intl que formata números, datas e moedas
 * segundo a cultura/idioma desejado (neste caso 'pt-PT' = Português de Portugal).
 */

/**
 * Retorna a classe CSS para o nível de risco
 * Usado para aplicar cores diferentes conforme o risco
 * Ex: getRiskLevel(30) → 'medium' → a CSS aplica cor amarela
 *
 * @param {number} score - Pontuação de risco (0 a 100)
 * @returns {string} 'low' | 'medium' | 'high' | 'critical'
 */
export function getRiskLevel(score) {
  if (score <= 25) return 'low';       // 0-25: Baixo (verde)
  if (score <= 50) return 'medium';    // 26-50: Médio (amarelo)
  if (score <= 75) return 'high';      // 51-75: Alto (laranja)
  return 'critical';                    // 76-100: Crítico (vermelho)
}

/**
 * Retorna um texto legível para o nível de risco (em português)
 * Ex: getRiskLabel(80) → 'Crítico'
 *
 * @param {number} score - Pontuação de risco (0 a 100)
 * @returns {string} Texto do nível de risco em português
 */
export function getRiskLabel(score) {
  if (score <= 25) return 'Baixo';
  if (score <= 50) return 'Médio';
  if (score <= 75) return 'Alto';
  return 'Crítico';
}

/**
 * Formata um número como valor monetário em Euros (€)
 * Usa a API Intl.NumberFormat do JavaScript para formatação localizada
 * Ex: formatCurrency(1500.5) → "1 500,50 €"
 *
 * @param {number} value - O valor numérico a formatar
 * @returns {string} Valor formatado como moeda EUR
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',   // Estilo: moeda
    currency: 'EUR',      // Moeda: Euro
  }).format(value);
}

/**
 * Formata uma data ISO para formato legível em português
 * Ex: formatDate('2026-02-28T15:30:00Z') → "28/02/2026, 15:30"
 *
 * @param {string} isoDate - Data em formato ISO (ex: '2026-02-28T15:30:00Z')
 * @returns {string} Data formatada em português
 */
export function formatDate(isoDate) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',     // Dia com 2 dígitos (ex: 28)
    month: '2-digit',   // Mês com 2 dígitos (ex: 02)
    year: 'numeric',    // Ano completo (ex: 2026)
    hour: '2-digit',    // Hora com 2 dígitos (ex: 15)
    minute: '2-digit',  // Minutos com 2 dígitos (ex: 30)
  }).format(new Date(isoDate)); // new Date() converte a string ISO num objeto Date
}

/**
 * Formata um número com separadores de milhar (formato PT)
 * Ex: formatNumber(15000) → "15 000"
 *
 * @param {number} value - O número a formatar
 * @returns {string} Número formatado com separadores
 */
export function formatNumber(value) {
  return new Intl.NumberFormat('pt-PT').format(value);
}

/**
 * Traduz o estado (status) de uma aposta de inglês para português
 * Ex: translateStatus('pending') → 'Pendente'
 *
 * @param {string} status - Estado em inglês
 * @returns {string} Estado em português
 */
export function translateStatus(status) {
  // "map" é um objeto que funciona como dicionário de tradução
  const map = {
    pending: 'Pendente',   // A aposta ainda está ativa
    won: 'Ganhou',         // O utilizador ganhou a aposta
    lost: 'Perdeu',        // O utilizador perdeu a aposta
    void: 'Anulada',       // A aposta foi cancelada/anulada
  };
  // map[status] procura a tradução; se não encontrar, devolve o status original
  // O operador || (ou) devolve o segundo valor se o primeiro for undefined
  return map[status] || status;
}

/**
 * Traduz o nome do desporto de inglês para português
 * Ex: translateSport('football') → 'Futebol'
 *
 * @param {string} sport - Nome do desporto em inglês
 * @returns {string} Nome do desporto em português
 */
export function translateSport(sport) {
  const map = {
    football: 'Futebol',
    basketball: 'Basquetebol',
    tennis: 'Ténis',
    hockey: 'Hóquei',
    baseball: 'Basebol',
    volleyball: 'Voleibol',
  };
  return map[sport] || sport;
}
