// Pré-geração de odds realistas
// Para cada combinação evento+seleção, gera 4 odds próximas.

import { SPORTS, BET_TEMPLATES } from "../data/sports.js";

// oddsMap: chave "event|selection" → array de 4 odds
const oddsMap = new Map();

// Todas as combinações possíveis de evento+seleção
const allEventSelections = [];

function generateBaseOdd() {
  return +(1.1 + Math.random() * 2.9).toFixed(2);
}

function generateOddVariations(base) {
  const variations = [base];
  for (let i = 0; i < 3; i++) {
    const delta = +(Math.random() * 0.3 - 0.15).toFixed(2);
    variations.push(Math.max(1.1, +(base + delta).toFixed(2)));
  }
  return variations;
}

// Montar todas as combinações e pré-gerar odds
for (const sportData of SPORTS) {
  for (const ev of sportData.events) {
    const eventName = `${ev.home} vs ${ev.away}`;

    for (const tmpl of BET_TEMPLATES) {
      const selections = tmpl.selections(ev.home, ev.away);

      for (const sel of selections) {
        const key = `${eventName}|${sel}`;
        oddsMap.set(key, generateOddVariations(generateBaseOdd()));

        allEventSelections.push({
          sport: sportData.sport,
          event: eventName,
          betType: tmpl.betType,
          selection: sel,
        });
      }
    }
  }
}

export function getRandomOdd(event, selection) {
  const odds = oddsMap.get(`${event}|${selection}`);
  return odds[Math.floor(Math.random() * odds.length)];
}

export function getRandomEventSelection() {
  return allEventSelections[
    Math.floor(Math.random() * allEventSelections.length)
  ];
}

export { allEventSelections, oddsMap };
