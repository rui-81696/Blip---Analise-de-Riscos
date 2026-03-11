// Geração de apostas individuais e em lote

import crypto from "crypto";
import { getRandomEventSelection, getRandomOdd } from "./odds.js";
import { INITIAL_COUNT } from "../config.js";

export function generateBet() {
  const { sport, event, betType, selection } = getRandomEventSelection();
  const odd = getRandomOdd(event, selection);
  const stake = +(5 + Math.random() * 495).toFixed(2);

  return {
    id: crypto.randomUUID(),
    sport,
    event,
    betType,
    selection,
    odd,
    stake,
  };
}

export function generateInitialBets() {
  console.log(`A gerar ${INITIAL_COUNT.toLocaleString()} apostas iniciais...`);
  const start = performance.now();

  const bets = new Array(INITIAL_COUNT);
  for (let i = 0; i < INITIAL_COUNT; i++) {
    bets[i] = generateBet();
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`Geradas em ${elapsed}s\n`);

  // Mostrar 5 exemplos
  console.log("─── Exemplos de apostas geradas ───");
  for (let i = 0; i < 5; i++) {
    const b = bets[i];
    console.log(
      `  [${b.sport}] ${b.event} | ${b.betType}: ${b.selection} | Odd: ${b.odd} | Stake: €${b.stake}`
    );
  }
  console.log(`  ... e mais ${(INITIAL_COUNT - 5).toLocaleString()} apostas\n`);

  return bets;
}
