/*
 * ===== mockGenerator.js =====
 * GERADOR DE APOSTAS SIMULADAS
 *
 * Gera apostas simuladas realistas com base em mercados pré-definidos.
 * Cada evento desportivo tem "mercados" com seleções e odds realistas.
 *
 * MODELO DE APOSTA (Bet):
 * {
 *   id: string,          // Identificador único (UUID)
 *   sport: string,       // "Football", "Tennis", "Basketball", etc.
 *   event: string,       // "Manchester United vs Liverpool"
 *   betType: string,     // "Win", "Over/Under", "Handicap", etc.
 *   selection: string,   // "Manchester United to Win"
 *   odd: number,         // 1.1 a 4.0 (com ~4 variações por seleção)
 *   stake: number,       // Valor apostado em € (1 a 10000)
 *   createdAt: string,   // Data ISO (ex: "2026-03-01T15:30:00Z")
 * }
 *
 * PERSPETIVA DA EMPRESA (Bookmaker):
 * - stake = valor apostado pelo utilizador
 * - Se a seleção se verificar: empresa perde stake × odd (payout ao utilizador)
 * - Se a seleção NÃO se verificar: empresa ganha a stake
 *
 * CONCEITO: MERCADOS (Markets)
 * Cada evento tem mercados de apostas com ~4 variações de odds por seleção.
 * Isto simula a variação temporal realista das odds durante um evento.
 * Ex: "Manchester United to Win" pode ter odds [1.85, 1.90, 1.95, 2.00]
 */

import { v4 as uuidv4 } from 'uuid';

// ─── DESPORTOS E EVENTOS ───

const SPORTS = ['Football', 'Basketball', 'Tennis', 'Hockey', 'Baseball', 'Volleyball'];

const EVENTS = {
  Football: [
    'SL Benfica vs FC Porto',
    'Sporting CP vs SC Braga',
    'Real Madrid vs Barcelona',
    'Manchester United vs Liverpool',
    'Bayern Munich vs Borussia Dortmund',
    'Juventus vs AC Milan',
    'PSG vs Olympique Marseille',
    'Ajax vs Feyenoord',
  ],
  Basketball: [
    'LA Lakers vs Golden State Warriors',
    'Boston Celtics vs Miami Heat',
    'Real Madrid vs Barcelona',
    'Olympiacos vs Panathinaikos',
    'Chicago Bulls vs Brooklyn Nets',
  ],
  Tennis: [
    'Djokovic vs Alcaraz',
    'Sinner vs Medvedev',
    'Swiatek vs Sabalenka',
    'Nadal vs Federer',
    'Rune vs Tsitsipas',
  ],
  Hockey: [
    'Toronto Maple Leafs vs Montreal Canadiens',
    'Boston Bruins vs New York Rangers',
    'Edmonton Oilers vs Calgary Flames',
  ],
  Baseball: [
    'NY Yankees vs Boston Red Sox',
    'LA Dodgers vs SF Giants',
    'Chicago Cubs vs St. Louis Cardinals',
  ],
  Volleyball: [
    'Brasil vs Polónia',
    'Itália vs Sérvia',
    'Japão vs Estados Unidos',
  ],
};

/*
 * ─── PADRÕES DE TIPOS DE APOSTA POR DESPORTO ───
 * Cada desporto tem tipos de aposta (betType) diferentes.
 * Para cada tipo, definimos como gerar as seleções a partir dos nomes das equipas.
 * baseOdd é uma função que retorna uma odd base aleatória no intervalo realista.
 * As odds finais serão ~4 variações em torno desta base (±0.10).
 */
const BET_TYPE_PATTERNS = {
  Football: [
    {
      betType: 'Win',
      generateSelections: ([home, away]) => [
        { selection: `${home} to Win`, baseOdd: () => randomBetween(1.3, 3.0) },
        { selection: 'Draw', baseOdd: () => randomBetween(2.8, 4.0) },
        { selection: `${away} to Win`, baseOdd: () => randomBetween(1.3, 3.0) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 2.5 Goals', baseOdd: () => randomBetween(1.6, 2.3) },
        { selection: 'Under 2.5 Goals', baseOdd: () => randomBetween(1.6, 2.3) },
      ],
    },
    {
      betType: 'Both Teams to Score',
      generateSelections: () => [
        { selection: 'Yes', baseOdd: () => randomBetween(1.5, 2.2) },
        { selection: 'No', baseOdd: () => randomBetween(1.5, 2.2) },
      ],
    },
  ],
  Basketball: [
    {
      betType: 'Win',
      generateSelections: ([home, away]) => [
        { selection: `${home} to Win`, baseOdd: () => randomBetween(1.2, 2.8) },
        { selection: `${away} to Win`, baseOdd: () => randomBetween(1.2, 2.8) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 215.5 Points', baseOdd: () => randomBetween(1.7, 2.1) },
        { selection: 'Under 215.5 Points', baseOdd: () => randomBetween(1.7, 2.1) },
      ],
    },
    {
      betType: 'Handicap',
      generateSelections: ([home, away]) => [
        { selection: `${home} -5.5`, baseOdd: () => randomBetween(1.8, 2.0) },
        { selection: `${away} +5.5`, baseOdd: () => randomBetween(1.8, 2.0) },
      ],
    },
  ],
  Tennis: [
    {
      betType: 'Win',
      generateSelections: ([p1, p2]) => [
        { selection: `${p1} to Win`, baseOdd: () => randomBetween(1.2, 3.5) },
        { selection: `${p2} to Win`, baseOdd: () => randomBetween(1.2, 3.5) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 2.5 Sets', baseOdd: () => randomBetween(1.5, 2.5) },
        { selection: 'Under 2.5 Sets', baseOdd: () => randomBetween(1.5, 2.5) },
      ],
    },
  ],
  Hockey: [
    {
      betType: 'Win',
      generateSelections: ([home, away]) => [
        { selection: `${home} to Win`, baseOdd: () => randomBetween(1.4, 3.0) },
        { selection: 'Draw', baseOdd: () => randomBetween(3.0, 4.0) },
        { selection: `${away} to Win`, baseOdd: () => randomBetween(1.4, 3.0) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 5.5 Goals', baseOdd: () => randomBetween(1.7, 2.3) },
        { selection: 'Under 5.5 Goals', baseOdd: () => randomBetween(1.7, 2.3) },
      ],
    },
  ],
  Baseball: [
    {
      betType: 'Win',
      generateSelections: ([home, away]) => [
        { selection: `${home} to Win`, baseOdd: () => randomBetween(1.3, 2.8) },
        { selection: `${away} to Win`, baseOdd: () => randomBetween(1.3, 2.8) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 8.5 Runs', baseOdd: () => randomBetween(1.7, 2.1) },
        { selection: 'Under 8.5 Runs', baseOdd: () => randomBetween(1.7, 2.1) },
      ],
    },
  ],
  Volleyball: [
    {
      betType: 'Win',
      generateSelections: ([home, away]) => [
        { selection: `${home} to Win`, baseOdd: () => randomBetween(1.3, 2.8) },
        { selection: `${away} to Win`, baseOdd: () => randomBetween(1.3, 2.8) },
      ],
    },
    {
      betType: 'Over/Under',
      generateSelections: () => [
        { selection: 'Over 3.5 Sets', baseOdd: () => randomBetween(1.6, 2.2) },
        { selection: 'Under 3.5 Sets', baseOdd: () => randomBetween(1.6, 2.2) },
      ],
    },
  ],
};

// ─── FUNÇÕES AUXILIARES ───

/**
 * Gera um número aleatório decimal entre min e max
 * Ex: randomBetween(1.5, 3.0) pode devolver 2.347
 */
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Seleciona um elemento aleatório de um array
 * Ex: randomChoice(['a', 'b', 'c']) pode devolver 'b'
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Gera uma data aleatória dentro dos últimos X dias
 * @param {number} daysBack - Quantos dias para trás (por defeito: 30)
 * @returns {string} Data em formato ISO
 */
function randomDate(daysBack = 30) {
  const now = new Date();
  const pastDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime());
  return new Date(randomTime).toISOString();
}

/**
 * Gera um valor de stake (valor apostado) com distribuição realista.
 * A maioria das apostas são de valores baixos (simulando comportamento real).
 *
 * Distribuição:
 * - 50%: €1 a €50 (apostas pequenas - maioria dos utilizadores)
 * - 30%: €50 a €500 (apostas médias)
 * - 15%: €500 a €2000 (apostas grandes)
 * - 5%: €2000 a €10000 (high rollers)
 *
 * @returns {number} Valor da stake arredondado a 2 casas decimais
 */
function generateStake() {
  const rand = Math.random();
  let stake;
  if (rand < 0.5) {
    stake = randomBetween(1, 50);
  } else if (rand < 0.8) {
    stake = randomBetween(50, 500);
  } else if (rand < 0.95) {
    stake = randomBetween(500, 2000);
  } else {
    stake = randomBetween(2000, 10000);
  }
  return Math.round(stake * 100) / 100;
}

/**
 * Gera ~4 variações de odds a partir de uma odd base.
 * Simula as alterações de odds ao longo do tempo para um evento.
 * No máximo uma seleção tem ~4 odds diferentes (como num jogo real).
 *
 * Ex: baseOdd=1.90 → [1.80, 1.85, 1.90, 1.95]
 *
 * As odds ficam sempre entre 1.01 e 4.0 (intervalo realista).
 *
 * @param {number} baseOdd - Odd central
 * @param {number} count - Número de variações (por defeito: 4)
 * @returns {Array<number>} Array de odds ordenadas
 */
function generateOddVariations(baseOdd, count = 4) {
  const variations = [];
  const step = 0.05;
  const start = baseOdd - step * Math.floor(count / 2);
  for (let i = 0; i < count; i++) {
    const odd = Math.round((start + step * i) * 100) / 100;
    variations.push(Math.max(1.01, Math.min(4.0, odd)));
  }
  return variations;
}

// ─── FUNÇÕES EXPORTADAS ───

/**
 * Gera a estrutura de mercados para todos os eventos.
 * Cada evento fica com seleções pré-definidas e ~4 odds por seleção.
 * Esta estrutura é gerada UMA VEZ e reutilizada para todas as apostas,
 * garantindo que as odds são consistentes (como num evento real).
 *
 * Estrutura retornada:
 * {
 *   "Manchester United vs Liverpool": {
 *     sport: "Football",
 *     selections: [
 *       { betType: "Win", selection: "Manchester United to Win", odds: [1.85, 1.90, 1.95, 2.00] },
 *       { betType: "Win", selection: "Draw", odds: [3.10, 3.15, 3.20, 3.25] },
 *       ...
 *     ]
 *   },
 *   ...
 * }
 *
 * @returns {object} Mapa de evento → { sport, selections }
 */
export function generateMarkets() {
  const markets = {};

  for (const sport of SPORTS) {
    for (const event of (EVENTS[sport] || [])) {
      // Extrair nomes das equipas/jogadores do evento
      // Ex: "Manchester United vs Liverpool" → ["Manchester United", "Liverpool"]
      const teams = event.split(' vs ').map(t => t.trim());
      const eventMarket = [];
      const patterns = BET_TYPE_PATTERNS[sport] || [];

      for (const pattern of patterns) {
        const selections = pattern.generateSelections(teams);
        for (const sel of selections) {
          // Gerar a odd base (chamada uma vez por seleção)
          const baseOdd = sel.baseOdd();
          // Criar ~4 variações realistas em torno da odd base
          const odds = generateOddVariations(baseOdd, 4);
          eventMarket.push({
            betType: pattern.betType,
            selection: sel.selection,
            odds, // Ex: [1.85, 1.90, 1.95, 2.00]
          });
        }
      }

      markets[event] = { sport, selections: eventMarket };
    }
  }

  return markets;
}

/**
 * Gera uma ÚNICA aposta a partir dos mercados pré-gerados.
 * Escolhe aleatoriamente um evento, uma seleção, e uma odd.
 *
 * @param {object} markets - Mercados gerados por generateMarkets()
 * @param {object} options - Opções de geração
 * @param {number} options.daysBack - Dias no passado para a data (por defeito: 30)
 * @returns {object} Aposta: { id, sport, event, betType, selection, odd, stake, createdAt }
 */
export function generateSingleBet(markets, options = {}) {
  const { daysBack = 30 } = options;

  // Escolher um evento aleatório dos mercados disponíveis
  const eventNames = Object.keys(markets);
  const event = randomChoice(eventNames);
  const market = markets[event];

  // Escolher uma seleção aleatória deste evento
  const selData = randomChoice(market.selections);

  // Escolher uma das ~4 odds disponíveis para esta seleção
  const odd = randomChoice(selData.odds);

  // Gerar o valor da aposta (stake) com distribuição realista
  const stake = generateStake();

  return {
    id: uuidv4(),
    sport: market.sport,         // Ex: "Football"
    event,                       // Ex: "Manchester United vs Liverpool"
    betType: selData.betType,    // Ex: "Win"
    selection: selData.selection, // Ex: "Manchester United to Win"
    odd,                         // Ex: 1.95
    stake,                       // Ex: 150.00
    createdAt: randomDate(daysBack),
  };
}

/**
 * Gera MÚLTIPLAS apostas simuladas.
 * Primeiro gera os mercados, depois cria apostas a partir deles.
 *
 * @param {number} count - Número de apostas (por defeito: 50000, ~2000 por evento)
 * @param {object} options - Opções de geração
 * @returns {{ bets: Array, markets: object }} Apostas geradas e mercados usados
 */
export function generateBets(count = 50000, options = {}) {
  // 1. Gerar a estrutura de mercados (uma vez)
  const markets = generateMarkets();

  // 2. Gerar 'count' apostas usando os mercados
  const bets = [];
  for (let i = 0; i < count; i++) {
    bets.push(generateSingleBet(markets, options));
  }

  // 3. Ordenar por data (mais recentes primeiro)
  bets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Retornar apostas E mercados (os mercados são reutilizados no WebSocket)
  return { bets, markets };
}

// Exportar constantes para uso noutros ficheiros
export { SPORTS, EVENTS };
