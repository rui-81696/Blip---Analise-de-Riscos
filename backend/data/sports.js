// Dados dos desportos, eventos e tipos de aposta

export const SPORTS = [
  {
    sport: "Football",
    events: [
      { home: "Manchester United", away: "Liverpool" },
      { home: "Barcelona", away: "Real Madrid" },
      { home: "Bayern Munich", away: "Borussia Dortmund" },
      { home: "PSG", away: "Marseille" },
      { home: "Benfica", away: "Porto" },
      { home: "Juventus", away: "AC Milan" },
    ],
  },
  {
    sport: "Tennis",
    events: [
      { home: "Djokovic", away: "Alcaraz" },
      { home: "Sinner", away: "Medvedev" },
      { home: "Nadal", away: "Federer" },
    ],
  },
  {
    sport: "Basketball",
    events: [
      { home: "Lakers", away: "Celtics" },
      { home: "Warriors", away: "Bucks" },
      { home: "76ers", away: "Nuggets" },
    ],
  },
];

// Cada template gera seleções concretas a partir dos nomes das equipas
export const BET_TEMPLATES = [
  {
    betType: "Win",
    selections: (home, away) => [`${home} to Win`, `${away} to Win`, "Draw"],
  },
  {
    betType: "Over/Under",
    selections: () => ["Over 2.5", "Under 2.5"],
  },
  {
    betType: "Handicap",
    selections: (home, away) => [`${home} -1.5`, `${away} +1.5`],
  },
];
