import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";

const BACKEND_URL = "http://localhost:3001";
const WS_URL = "ws://localhost:3001/ws";

async function waitForWebSocketOpen(ws, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("Timeout a abrir WebSocket"));
    }, timeoutMs);

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

async function waitForMessage(ws, predicate, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(new Error("Timeout a aguardar mensagem WebSocket"));
    }, timeoutMs);

    function onMessage(raw) {
      try {
        const payload = JSON.parse(raw.toString());
        if (predicate(payload)) {
          clearTimeout(timeoutId);
          ws.off("message", onMessage);
          ws.off("error", onError);
          resolve(payload);
        }
      } catch {
        // Ignora mensagens não JSON.
      }
    }

    function onError(error) {
      clearTimeout(timeoutId);
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(error);
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

test("assistant flutuante responde e alterna com Ctrl+M", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Abrir assistant" })).toBeVisible();

  await page.getByRole("button", { name: "Abrir assistant" }).click();
  await expect(page.getByRole("dialog", { name: "Painel do assistant" })).toBeVisible();

  await page.getByRole("button", { name: "Resumo" }).click();
  await expect(page.getByText("Resumo de apostas para o período", { exact: false })).toBeVisible({ timeout: 20000 });

  await page.keyboard.press("Control+m");
  await expect(page.getByRole("button", { name: "Abrir assistant" })).toBeVisible();

  await page.keyboard.press("Control+m");
  await expect(page.getByRole("dialog", { name: "Painel do assistant" })).toBeVisible();
});

test("cobre a infraestrutura WebLLM já implementada", async ({ page, request }) => {
  const networkRequests = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.includes("/api/bets")) {
      networkRequests.push(url);
    }
    await route.continue();
  });

  await page.goto("/");

  await expect(page.getByText("Análise de Riscos - Apostas Agrupadas")).toBeVisible();
  await expect(page.getByText("● Ligado")).toBeVisible({ timeout: 20000 });
  await expect(page.locator(".summary-bar")).toContainText("Grupos:");
  await expect(page.locator(".summary-bar")).toContainText("Total apostas:");

  const ws = new WebSocket(WS_URL);
  await waitForWebSocketOpen(ws);

  const initialMessage = await waitForMessage(
    ws,
    (payload) => payload?.type === "initial" && Array.isArray(payload.bets) && payload.bets.length > 0
  );
  expect(initialMessage.bets.length).toBeGreaterThan(0);

  const liveMessage = await waitForMessage(
    ws,
    (payload) => payload?.type === "live" && Array.isArray(payload.bets) && payload.bets.length > 0,
    90000
  );
  expect(liveMessage.bets[0]).toHaveProperty("id");
  expect(liveMessage.bets[0]).toHaveProperty("sport");

  const summaryResponse = await request.get(`${BACKEND_URL}/api/stats/summary?period=24h`);
  expect(summaryResponse.ok()).toBeTruthy();
  const summary = await summaryResponse.json();
  expect(summary).toMatchObject({
    period: "24h",
  });
  expect(summary.totalBets).toBeGreaterThan(0);
  expect(summary.totalStake).toBeGreaterThan(0);
  expect(summary.totalExposure).toBeGreaterThan(0);

  const bySportResponse = await request.get(`${BACKEND_URL}/api/stats/by-sport?period=24h&limit=5`);
  expect(bySportResponse.ok()).toBeTruthy();
  const bySport = await bySportResponse.json();
  expect(bySport.period).toBe("24h");
  expect(Array.isArray(bySport.sports)).toBeTruthy();
  expect(bySport.sports.length).toBeGreaterThan(0);
  expect(bySport.sports[0]).toHaveProperty("sport");
  expect(bySport.sports[0]).toHaveProperty("betCount");

  const byPeriodResponse = await request.get(
    `${BACKEND_URL}/api/stats/by-period?from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z&granularity=hour`
  );
  expect(byPeriodResponse.ok()).toBeTruthy();
  const byPeriod = await byPeriodResponse.json();
  expect(byPeriod).toMatchObject({
    from: "2026-01-01T00:00:00Z",
    to: "2026-01-02T00:00:00Z",
    granularity: "hour",
  });
  expect(Array.isArray(byPeriod.data)).toBeTruthy();

  const byRiskResponse = await request.get(`${BACKEND_URL}/api/stats/by-risk?period=24h`);
  expect(byRiskResponse.ok()).toBeTruthy();
  const byRisk = await byRiskResponse.json();
  expect(byRisk.period).toBe("24h");
  expect(byRisk.riskBuckets).toBeTruthy();
  expect(Object.keys(byRisk.riskBuckets)).toEqual(expect.arrayContaining(["low", "medium", "high", "critical"]));

  const assistantSummaryResponse = await request.post(`${BACKEND_URL}/api/assistant/query`, {
    data: {
      intent: "summary",
      params: { period: "24h" },
      question: "Resumo de apostas de hoje",
    },
  });
  expect(assistantSummaryResponse.ok()).toBeTruthy();
  const assistantSummary = await assistantSummaryResponse.json();
  expect(assistantSummary).toHaveProperty("data");
  expect(assistantSummary).toHaveProperty("explanation");
  expect(assistantSummary.data).toHaveProperty("totalBets");
  expect(assistantSummary.explanation.length).toBeGreaterThan(0);

  const assistantBySportResponse = await request.post(`${BACKEND_URL}/api/assistant/query`, {
    data: {
      intent: "by-sport",
      params: { period: "24h", limit: 5 },
      question: "Por desporto",
    },
  });
  expect(assistantBySportResponse.ok()).toBeTruthy();
  const assistantBySport = await assistantBySportResponse.json();
  expect(assistantBySport.data).toHaveProperty("sports");
  expect(assistantBySport.explanation.length).toBeGreaterThan(0);

  const assistantByRiskResponse = await request.post(`${BACKEND_URL}/api/assistant/query`, {
    data: {
      intent: "by-risk",
      params: { period: "24h" },
      question: "Por risco",
    },
  });
  expect(assistantByRiskResponse.ok()).toBeTruthy();
  const assistantByRisk = await assistantByRiskResponse.json();
  expect(assistantByRisk.data).toHaveProperty("riskBuckets");
  expect(assistantByRisk.explanation.length).toBeGreaterThan(0);

  const assistantInvalidResponse = await request.post(`${BACKEND_URL}/api/assistant/query`, {
    data: {
      intent: "unknown-intent",
      params: {},
      question: "teste",
    },
  });
  expect(assistantInvalidResponse.status()).toBe(400);

  ws.close();

  expect(networkRequests.filter((url) => url.includes("/api/bets")).length).toBe(0);
});