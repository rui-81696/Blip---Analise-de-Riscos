/*
 * ===== formatters.js =====
 * FUNÇÕES UTILITÁRIAS para formatar dados.
 * Funções "puras" - recebem um valor e devolvem outro sem efeitos secundários.
 *
 * Usadas em vários componentes para:
 * - Formatar valores monetários (ex: 1500 → "1 500,00 €")
 * - Formatar datas (ex: ISO string → "28/02/2026, 15:30")
 * - Traduzir termos de inglês para português
 */

/**
 * Formata um número como valor monetário em Euros (€)
 * Ex: formatCurrency(1500.5) → "1 500,50 €"
 */
export function formatCurrency(value) {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
  }).format(value);
}

/**
 * Formata uma data ISO para formato legível em português
 * Ex: formatDate('2026-02-28T15:30:00Z') → "28/02/2026, 15:30"
 */
export function formatDate(isoDate) {
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoDate));
}

/**
 * Formata um número com separadores de milhar (formato PT)
 * Ex: formatNumber(15000) → "15 000"
 */
export function formatNumber(value) {
  return new Intl.NumberFormat('pt-PT').format(value);
}

/**
 * Traduz o nome do desporto de inglês para português
 * Suporta nomes capitalizados ("Football") e minúsculos ("football").
 * Ex: translateSport('Football') → 'Futebol'
 */
export function translateSport(sport) {
  const map = {
    Football: 'Futebol',
    Basketball: 'Basquetebol',
    Tennis: 'Ténis',
    Hockey: 'Hóquei',
    Baseball: 'Basebol',
    Volleyball: 'Voleibol',
    football: 'Futebol',
    basketball: 'Basquetebol',
    tennis: 'Ténis',
    hockey: 'Hóquei',
    baseball: 'Basebol',
    volleyball: 'Voleibol',
  };
  return map[sport] || sport;
}

/**
 * Traduz o tipo de aposta (betType) para português
 * Ex: translateBetType('Win') → 'Vencedor'
 */
export function translateBetType(betType) {
  const map = {
    'Win': 'Vencedor',
    'Over/Under': 'Mais/Menos',
    'Both Teams to Score': 'Ambas Marcam',
    'Handicap': 'Handicap',
  };
  return map[betType] || betType;
}
