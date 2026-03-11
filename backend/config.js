// Configurações do servidor

export const PORT = 3001;

// Apostas iniciais
export const INITIAL_COUNT = 400_000;
export const CHUNK_SIZE = 10_000;

// Streaming em tempo real (50 apostas × 10 vezes/seg = 500/seg)
export const BETS_PER_BATCH = 5;
export const INTERVAL_MS = 1000;
