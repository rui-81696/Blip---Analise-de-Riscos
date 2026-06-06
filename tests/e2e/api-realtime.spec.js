import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";

// Cobre a arquitetura atual (opção B): agregação em SQL via REST + WS como tick.
// Os endpoints aqui testados são os que o frontend realmente consome:
//   /api/bets/grouped, /api/bets/sports, /api/bets/distribution, /api/bets/range
// e o WebSocket que apenas notifica ("tick"), sem transportar apostas em bruto.

const BACKEND_URL = "http://localhost:3001";
const WS_URL = "ws://localhost:3001/ws";

const DEFAULT_RANGES = [
  { min: 0, max: 1 },
  { min: 1, max: 10 },
  { min: 10, max: 50 },
  { min: 50, max: 200 },
  { min: 200, max: null },
];

function waitForWebSocketOpen(ws, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("Timeout a abrir WebSocket")), timeoutMs);
    ws.once("open", () => {
      clearTimeout(timeoutId);
      resolve();
    });
    ws.once("error", (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function waitForMessage(ws, predicate, timeoutMs = 75000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      ws.off("message", onMessage);
      reject(new Error("Timeout a aguardar mensagem WebSocket"));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const payload = JSON.parse(raw.toString());
        if (predicate(payload)) {
          clearTimeout(timeoutId);
          ws.off("message", onMessage);
          resolve(payload);
        }
      } catch {
        // Ignora mensagens não JSON.
      }
    }

    ws.on("message", onMessage);
  });
}

test("endpoints REST de agregação devolvem dados consistentes", async ({ request }) => {
  // 1) Grouped — a fonte da tabela. Resposta de tamanho limitado (LIMIT).
  const groupedResponse = await request.get(`${BACKEND_URL}/api/bets/grouped?timeRange=-1&limit=10`);
  expect(groupedResponse.ok()).toBeTruthy();
  const grouped = await groupedResponse.json();

  expect(grouped).toHaveProperty("totalGroups");
  expect(grouped).toHaveProperty("totalBets");
  expect(grouped).toHaveProperty("totalExposure");
  expect(Array.isArray(grouped.groups)).toBeTruthy();
  expect(grouped.groups.length).toBeLessThanOrEqual(10);
  expect(grouped.totalBets).toBeGreaterThan(0);

  const group = grouped.groups[0];
  for (const key of ["sport", "event", "market", "selection", "odds", "bet_count", "total_stake", "total_exposure", "last_bet_placed_at"]) {
    expect(group).toHaveProperty(key);
  }

  // 2) Filtro HAVING (minBets impossível) → nenhum grupo.
  const filteredResponse = await request.get(`${BACKEND_URL}/api/bets/grouped?timeRange=-1&minBets=999999999`);
  expect(filteredResponse.ok()).toBeTruthy();
  const filtered = await filteredResponse.json();
  expect(filtered.totalGroups).toBe(0);
  expect(filtered.groups.length).toBe(0);

  // 3) Sports — alimenta o dropdown.
  const sportsResponse = await request.get(`${BACKEND_URL}/api/bets/sports`);
  expect(sportsResponse.ok()).toBeTruthy();
  const sportsBody = await sportsResponse.json();
  expect(Array.isArray(sportsBody.sports)).toBeTruthy();
  expect(sportsBody.sports.length).toBeGreaterThan(0);

  // 4) Distribution — agregação por faixa de UM grupo (payload limitado).
  const distributionResponse = await request.post(`${BACKEND_URL}/api/bets/distribution`, {
    data: {
      sport: group.sport,
      event: group.event,
      betType: group.market,
      selection: group.selection,
      odd: group.odds,
      timeRange: -1,
      ranges: DEFAULT_RANGES,
    },
  });
  expect(distributionResponse.ok()).toBeTruthy();
  const distribution = await distributionResponse.json();

  expect(distribution.stats.count).toBeGreaterThan(0);
  expect(distribution.distribution.length).toBe(DEFAULT_RANGES.length);
  // As faixas cobrem todos os stakes positivos → a soma das contagens == total.
  const bucketSum = distribution.distribution.reduce((acc, b) => acc + b.count, 0);
  expect(bucketSum).toBe(distribution.stats.count);
  expect(distribution.stats.min).toBeGreaterThanOrEqual(0);
  expect(distribution.stats.max).toBeGreaterThanOrEqual(distribution.stats.min);

  // 5) Range — janela de apostas individuais usada pelo assistente.
  const rangeResponse = await request.get(`${BACKEND_URL}/api/bets/range?period=24h&limit=50`);
  expect(rangeResponse.ok()).toBeTruthy();
  const rangeBody = await rangeResponse.json();
  expect(Array.isArray(rangeBody.bets)).toBeTruthy();
  if (rangeBody.bets.length > 0) {
    for (const key of ["id", "sport", "betType", "odd", "stake", "timestamp"]) {
      expect(rangeBody.bets[0]).toHaveProperty(key);
    }
  }
});

test("a tabela carrega os agregados via REST", async ({ page }) => {
  const groupedRequests = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/bets/grouped")) groupedRequests.push(req.url());
  });

  await page.goto("/");

  await expect(page.getByText("Análise de Riscos - Apostas Agrupadas")).toBeVisible();
  await expect(page.getByText("● Ligado")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".summary-bar")).toContainText("Total apostas:");
  await expect(page.locator("tbody tr .sport-cell").first()).toBeVisible({ timeout: 30000 });

  // A tabela obtém os dados do endpoint SQL (já não do WebSocket).
  expect(groupedRequests.length).toBeGreaterThan(0);
});

test("o WebSocket envia apenas ticks (sem apostas em bruto)", async () => {
  test.setTimeout(120000);

  const ws = new WebSocket(WS_URL);
  await waitForWebSocketOpen(ws);

  // O tick é emitido a cada INTERVAL_MS (1/min na config de demo).
  const tick = await waitForMessage(ws, (payload) => payload?.type === "tick", 75000);

  expect(tick).toHaveProperty("latestId");
  expect(typeof tick.latestId).toBe("number");
  // Contrato da opção B: o WS já não transporta apostas.
  expect(tick).not.toHaveProperty("bets");

  ws.close();
});
