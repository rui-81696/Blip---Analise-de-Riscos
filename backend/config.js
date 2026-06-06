// Configurações do servidor

export const PORT = 3001;

// Apostas iniciais (seed da BD quando a tabela está vazia)
export const INITIAL_COUNT = 1;

// Streaming em tempo real (BETS_PER_BATCH apostas a cada INTERVAL_MS)
export const BETS_PER_BATCH = 10;
export const INTERVAL_MS = 30000;
