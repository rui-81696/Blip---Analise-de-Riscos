// Geração de apostas individuais e em lote

import crypto from "crypto";
import { getRandomEventSelection, getRandomOdd } from "./odds.js";
import { INITIAL_COUNT } from "../config.js";

export function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

export function getDateRanges() {
  const now = new Date();

  return {
    now,
    last15minutes: new Date(now.getTime() - 15 * 60 * 1000),
    oneHourAgo: new Date(now.getTime() - 60 * 60 * 1000),
    twoHoursAgo: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    lastDay: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  };
}

function calculateRiskScore(stake, odds) {
  let riskScore = 0;
  let exposureRisk = 0;

  const potentialLoss = stake * (odds - 1);

  if (potentialLoss > 5000) exposureRisk = 95;
  else if (potentialLoss > 2500) exposureRisk = 80;
  else if (potentialLoss > 1000) exposureRisk = 60;
  else if (potentialLoss > 500)  exposureRisk = 40;
  else exposureRisk = Math.min((potentialLoss / 500) * 40, 35);

  if (stake > 2000) riskScore += 40;
  else if (stake > 1000) riskScore += 30;
  else if (stake > 500)  riskScore += 20;
  else if (stake > 100)  riskScore += 10;

  if (odds > 20) riskScore += 30;
  else if (odds > 10) riskScore += 20;
  else if (odds < 1.15) riskScore += 25;

  const combinedRisk = Math.min(
    Math.round((riskScore * 0.3) + (exposureRisk * 0.7)),
    100
  );

  return {
    riskScore: combinedRisk,
    exposureRisk: Math.round(exposureRisk),
    potentialLoss: parseFloat(potentialLoss.toFixed(2)) // Útil para debug ou UI
  };
}

export function generateBet({nextId, isLive = false } = {}) {
  const { sport, event, betType, selection } = getRandomEventSelection();
  const odd = getRandomOdd(event, selection);
  const stake = +(5 + Math.random() * 495).toFixed(2);
  const dateTime = getDateRanges();

  const potentialPayout = parseFloat((stake * odd).toFixed(2));
  const potentialProfit = parseFloat((potentialPayout - stake).toFixed(2));

  const { riskScore, exposureRisk } = calculateRiskScore(stake, odd);

  return {
    id: nextId,
    sport,
    event,
    betType,
    selection,
    odd,
    stake,
    // Bets live usam horário real; seed inicial usa janela aleatória de 24h.
    timestamp: isLive ? dateTime.now : randomDate(dateTime.lastDay, dateTime.now),
    potentialPayout,
    potentialProfit,
    riskScore,
    exposureRisk,
  };
}

export async function generateInitialBets() {
  console.log(`A gerar ${INITIAL_COUNT.toLocaleString()} apostas iniciais...`);
  const start = performance.now();

  const bets = new Array(INITIAL_COUNT);
  for (let i = 0; i < INITIAL_COUNT; i++) {
    const nextId = i + 1;
    bets[i] = generateBet({ nextId: nextId, isLive: false });
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`Geradas em ${elapsed}s\n`);

  return bets;
}
