/*
 * ===== mockGenerator.js =====
 * GERADOR DE DADOS FALSOS (Mock Data)
 *
 * Este ficheiro gera apostas simuladas realistas para fins de desenvolvimento.
 * Os dados são "fake" mas têm a mesma estrutura que dados reais teriam.
 *
 * O QUE É MOCK DATA?
 * Mock = falso/simulado. Quando estamos a desenvolver, não temos dados reais,
 * por isso geramos dados falsos (mas verosímeis) para testar a aplicação.
 *
 * CONCEITOS JS USADOS:
 * - UUID: Identificador Único Universal (string única como "a1b2c3d4-...")
 * - Math.random(): gera um número aleatório entre 0 e 1
 * - Arrays e objetos constantes: dados pré-definidos para gerar combinações
 * - export: torna funções disponíveis para outros ficheiros
 */

// UUID v4: gera identificadores únicos universais (strings únicas)
// uuidv4() → "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
import { v4 as uuidv4 } from 'uuid';

// ─── CONSTANTES PARA GERAÇÃO DE DADOS ───

// Desportos disponíveis
const SPORTS = ['football', 'basketball', 'tennis', 'hockey', 'baseball', 'volleyball'];

// Eventos para cada desporto (jogos possíveis)
// É um objeto onde a chave é o desporto e o valor é um array de strings
const EVENTS = {
  football: [
    'SL Benfica vs FC Porto',
    'Sporting CP vs SC Braga',
    'Real Madrid vs Barcelona',
    'Manchester United vs Liverpool',
    'Bayern Munich vs Borussia Dortmund',
    'Juventus vs AC Milan',
    'PSG vs Olympique Marseille',
    'Ajax vs Feyenoord',
  ],
  basketball: [
    'LA Lakers vs Golden State Warriors',
    'Boston Celtics vs Miami Heat',
    'Real Madrid vs Barcelona',
    'Olympiacos vs Panathinaikos',
    'Chicago Bulls vs Brooklyn Nets',
  ],
  tennis: [
    'Djokovic vs Alcaraz',
    'Sinner vs Medvedev',
    'Swiatek vs Sabalenka',
    'Nadal vs Federer',
    'Rune vs Tsitsipas',
  ],
  hockey: [
    'Toronto Maple Leafs vs Montreal Canadiens',
    'Boston Bruins vs New York Rangers',
    'Edmonton Oilers vs Calgary Flames',
  ],
  baseball: [
    'NY Yankees vs Boston Red Sox',
    'LA Dodgers vs SF Giants',
    'Chicago Cubs vs St. Louis Cardinals',
  ],
  volleyball: [
    'Brasil vs Polónia',
    'Itália vs Sérvia',
    'Japão vs Estados Unidos',
  ],
};

// Estados possíveis de uma aposta
const STATUSES = ['pending', 'won', 'lost', 'void'];

// Prefixos para gerar userIds anónimos
const USER_PREFIXES = ['user', 'player', 'bettor', 'client', 'member'];

// ─── FUNÇÕES AUXILIARES ───

/**
 * Gera um número aleatório decimal entre min e max
 * Math.random() devolve um número entre 0 e 1 (ex: 0.7324)
 * Multiplicamos pelo intervalo e somamos o mínimo para obter o valor desejado
 *
 * Ex: randomBetween(5, 100) pode devolver 47.832
 */
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Seleciona um elemento aleatório de um array
 * Math.floor() arredonda para baixo (ex: 3.7 → 3)
 * Math.random() * arr.length dá um índice aleatório
 *
 * Ex: randomChoice(['a', 'b', 'c']) pode devolver 'b'
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Gera um userId anónimo com formato "prefixo_XXXX"
 * Ex: "player_0042", "user_1337"
 *
 * .padStart(4, '0') garante que o número tem sempre 4 dígitos
 * Ex: 42 → "42".padStart(4, '0') → "0042"
 */
function generateUserId() {
  const prefix = randomChoice(USER_PREFIXES);
  const number = Math.floor(Math.random() * 9999) + 1;
  return `${prefix}_${number.toString().padStart(4, '0')}`;
}

/**
 * Calcula o "risk score" (pontuação de risco) de uma aposta.
 * O risco é calculado com base em 3 fatores + um fator aleatório:
 *
 * 1. VALOR APOSTADO (até 40 pontos):
 *    Apostas altas = mais risco (>5000€ = 40 pontos)
 *
 * 2. ODDS (até 30 pontos):
 *    Odds altas = evento improvável = mais risco
 *
 * 3. STATUS (até 20 pontos):
 *    Apostas pendentes = mais risco (resultado desconhecido)
 *
 * 4. FATOR ALEATÓRIO (até 10 pontos):
 *    Para dar variabilidade natural aos dados
 *
 * @param {number} amount - Valor apostado
 * @param {number} odds - Odds da aposta
 * @param {string} status - Estado da aposta
 * @returns {number} Score de 0 (baixo risco) a 100 (crítico)
 */
function calculateRiskScore(amount, odds, status) {
  let score = 0;

  // Fator 1: Valor apostado (até 40 pontos)
  if (amount > 5000) score += 40;
  else if (amount > 2000) score += 30;
  else if (amount > 500) score += 20;
  else if (amount > 100) score += 10;
  else score += 5;

  // Fator 2: Odds altas = maior risco (até 30 pontos)
  if (odds > 10) score += 30;
  else if (odds > 5) score += 20;
  else if (odds > 3) score += 15;
  else if (odds > 2) score += 10;
  else score += 5;

  // Fator 3: Status contribui (até 20 pontos)
  if (status === 'pending') score += 20;      // Resultado desconhecido = mais risco
  else if (status === 'won') score += 15;      // Ganha = risco de pagamento
  else if (status === 'lost') score += 5;      // Perdida = pouco risco
  else score += 0;                              // Anulada = sem risco

  // Fator 4: Variabilidade aleatória (até 10 pontos)
  score += Math.floor(Math.random() * 11);

  // Garantir que o score fica entre 0 e 100
  // Math.min(100, ...) garante máximo 100
  // Math.max(0, ...) garante mínimo 0
  return Math.min(100, Math.max(0, score));
}

/**
 * Gera uma data aleatória dentro dos últimos X dias
 *
 * @param {number} daysBack - Quantos dias para trás (ex: 30 = último mês)
 * @returns {string} Data em formato ISO (ex: "2026-02-15T08:30:00.000Z")
 */
function randomDate(daysBack = 30) {
  const now = new Date();
  // Calcular a data X dias atrás
  // 24 * 60 * 60 * 1000 = milissegundos num dia (86400000)
  const pastDate = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  // Gerar um tempo aleatório entre a data passada e agora
  const randomTime = pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime());
  // Converter para string ISO
  return new Date(randomTime).toISOString();
}

// ─── FUNÇÕES EXPORTADAS (usadas por outros ficheiros) ───

/**
 * Gera uma ÚNICA aposta simulada.
 * Cada aposta é um objeto com todos os campos necessários.
 *
 * @param {object} options - Opções de geração
 * @param {number} options.daysBack - Dias no passado para a data (por defeito: 30)
 * @returns {object} Objeto de aposta com id, userId, sport, event, amount, odds, status, riskScore, createdAt, potentialProfit, actualProfit, prediction, closedAt
 */
export function generateSingleBet(options = {}) {
  const { daysBack = 30 } = options;

  // Escolher dados aleatórios
  const sport = randomChoice(SPORTS);
  const event = randomChoice(EVENTS[sport]); // Evento do desporto escolhido
  const createdAt = randomDate(daysBack);

  // Gerar valores numéricos aleatórios
  // Math.round(... * 100) / 100 arredonda a 2 casas decimais
  const amount = Math.round(randomBetween(10, 5000) * 100) / 100;    // 10€ a 5 000€ (mais realista)
  const odds = Math.round(randomBetween(1.05, 15.0) * 100) / 100;     // Odds de 1.05 a 15.00 (mais realista)
  
  // Determinar status com probabilidades mais realistas
  // 60% pending, 25% won, 12% lost, 3% void
  const rand = Math.random();
  const status = rand < 0.6 ? 'pending' : rand < 0.85 ? 'won' : rand < 0.97 ? 'lost' : 'void';
  
  const riskScore = calculateRiskScore(amount, odds, status);
  
  // Calcular ganho potencial (o que ganharia se vencesse)
  const potentialProfit = Math.round((amount * (odds - 1)) * 100) / 100;
  
  // Calcular ganho/perda real baseado no status
  let actualProfit = 0;
  let closedAt = null;
  let prediction = null;
  
  if (status === 'won') {
    // Ganhou a aposta
    actualProfit = potentialProfit;
    prediction = 'win';
    closedAt = new Date(new Date(createdAt).getTime() + randomBetween(1, 5) * 24 * 60 * 60 * 1000).toISOString();
  } else if (status === 'lost') {
    // Perdeu a aposta
    actualProfit = -amount;
    prediction = 'loss';
    closedAt = new Date(new Date(createdAt).getTime() + randomBetween(1, 5) * 24 * 60 * 60 * 1000).toISOString();
  } else if (status === 'void') {
    // Aposta anulada (money devolvido)
    actualProfit = 0;
    prediction = Math.random() > 0.5 ? 'win' : 'loss';
    closedAt = new Date(new Date(createdAt).getTime() + randomBetween(1, 3) * 24 * 60 * 60 * 1000).toISOString();
  }
  // Para 'pending' os valores preditos vs atuais podem diferir

  // Construir e devolver o objeto de aposta
  return {
    id: uuidv4(),                    // ID único universal
    userId: generateUserId(),         // Ex: "player_0042"
    sport,                            // Ex: "football"
    event,                            // Ex: "SL Benfica vs FC Porto"
    amount,                           // Ex: 250.00
    odds,                             // Ex: 3.50
    status,                           // Ex: "pending"
    riskScore,                        // Ex: 65
    createdAt,                        // Ex: "2026-02-15T08:30:00.000Z"
    potentialProfit,                  // Quanto ganharia se vencesse
    actualProfit,                     // Ganho/perda real
    prediction,                       // Previsão: 'win' ou 'loss'
    closedAt,                         // Data de encerramento (null se pending)
  };
}

/**
 * Gera MÚLTIPLAS apostas simuladas.
 *
 * @param {number} count - Número de apostas a gerar (por defeito: 500)
 * @param {object} options - Opções de geração
 * @returns {Array} Array de objetos de aposta, ordenados por data (mais recentes primeiro)
 */
export function generateBets(count = 500, options = {}) {
  const bets = [];

  // Gerar 'count' apostas
  for (let i = 0; i < count; i++) {
    bets.push(generateSingleBet(options));
  }

  // Ordenar por data de criação (mais recentes primeiro)
  // new Date(b) - new Date(a) = ordem descendente
  bets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return bets;
}

// Exportar constantes para uso noutros ficheiros
export { SPORTS, STATUSES };
