import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";

const WS_URL = "ws://localhost:3001/ws";
const API_BET_BY_ID_URL = "http://localhost:3001/api/bets";
const FRONTEND_CANDIDATES = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
].filter(Boolean);
const SAMPLE_SIZE = Number(process.env.LATENCY_SAMPLE_SIZE || 5);
const LATENCY_MAX_P95_MS = Number(process.env.LATENCY_MAX_P95_MS || 0);

async function resolveFrontendUrl() {
  for (const url of FRONTEND_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        return url;
      }
    } catch {
      // Tenta próxima URL.
    }
  }

  throw new Error(`Nao foi possivel encontrar frontend ativo. URLs testadas: ${FRONTEND_CANDIDATES.join(", ")}`);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(values) {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return {
    min: Math.min(...values),
    avg: sum / values.length,
    p95: percentile(values, 95),
    max: Math.max(...values),
  };
}

async function waitForLiveBet(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(new Error("Timeout a aguardar evento live no WebSocket"));
    }, 90000);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "live" && Array.isArray(msg.bets) && msg.bets.length > 0) {
          clearTimeout(timeout);
          ws.off("message", onMessage);
          ws.off("error", onError);
          resolve(msg.bets[0]);
        }
      } catch {
        // Ignorar mensagens não JSON/inesperadas.
      }
    }

    function onError(error) {
      clearTimeout(timeout);
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(error);
    }

    ws.on("message", onMessage);
    ws.on("error", onError);
  });
}

async function waitBetInApi(request, betId) {
  const start = Date.now();

  while (Date.now() - start < 120000) {
    const response = await request.get(`${API_BET_BY_ID_URL}/${betId}`);

    if (response.status() === 200) {
      return;
    }

    if (response.status() !== 404) {
      throw new Error(`Falha no /api/bets/:id: HTTP ${response.status()}`);
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error(`Aposta ${betId} nao apareceu no endpoint /api/bets/:id em 120s`);
}

async function getFrontendTotal(page) {
  const raw = await page.locator(".stats-bar span strong").first().innerText();
  const normalized = raw.replace(/[^0-9]/g, "");
  return Number(normalized || "0");
}

async function waitFrontendTotalIncrease(page, previousTotal) {
  const start = Date.now();

  while (Date.now() - start < 30000) {
    const current = await getFrontendTotal(page);
    if (current > previousTotal) {
      return current;
    }

    await new Promise((r) => setTimeout(r, 150));
  }

  throw new Error("O frontend nao atualizou o total de apostas em 30s");
}

test("mede latencia websocket -> bd -> frontend", async ({ page, request }) => {
  const frontendUrl = await resolveFrontendUrl();
  await page.goto(frontendUrl, { waitUntil: "domcontentloaded" });

  const ws = new WebSocket(WS_URL);

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout a abrir WebSocket")), 15000);
    ws.on("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  const wsToDb = [];
  const wsToFrontend = [];
  const dbToFrontend = [];

  for (let i = 0; i < SAMPLE_SIZE; i++) {
    const liveBet = await waitForLiveBet(ws);
    const tWs = Date.now();
    const totalBefore = await getFrontendTotal(page);

    await waitBetInApi(request, liveBet.id);
    const tDb = Date.now();

    await waitFrontendTotalIncrease(page, totalBefore);
    const tFrontend = Date.now();

    wsToDb.push(tDb - tWs);
    wsToFrontend.push(tFrontend - tWs);
    dbToFrontend.push(tFrontend - tDb);
  }

  ws.close();

  const stats = {
    sampleSize: SAMPLE_SIZE,
    wsToDb: summarize(wsToDb),
    wsToFrontend: summarize(wsToFrontend),
    dbToFrontend: summarize(dbToFrontend),
  };

  console.log("LatencyStats", JSON.stringify(stats, null, 2));

  // Guardrail opcional: ativa com LATENCY_MAX_P95_MS (ex.: 5000).
  if (LATENCY_MAX_P95_MS > 0) {
    expect(stats.wsToFrontend.p95).toBeLessThan(LATENCY_MAX_P95_MS);
  }
});
