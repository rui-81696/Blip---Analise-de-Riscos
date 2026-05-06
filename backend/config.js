// Configurações do servidor

export const PORT = 3001;

// Apostas iniciais
export const INITIAL_COUNT = 30;
export const CHUNK_SIZE = 10_000;

// Streaming em tempo real (10 apostas × 1 vez/min = 10/min)
export const BETS_PER_BATCH = 1;
export const INTERVAL_MS = 60_000;
