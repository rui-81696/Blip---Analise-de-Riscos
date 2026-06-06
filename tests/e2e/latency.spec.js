import { expect, test } from "@playwright/test";
import { WebSocket } from "ws";

// Mede a frescura em tempo real do pipeline da opção B:
//   geração da aposta → Postgres → WS "tick" → frontend re-puxa /grouped → UI.
//
// Alinhamos a medição ao "tick" (que transporta o latestId): a partir daí
// medimos quanto demora até a aposta ficar legível na BD e até o total no
// frontend refletir a novidade. Isola a latência tick→refetch (o que a opção B
// controla), excluindo a cadência de geração.

const WS_URL = "ws://localhost:3001/ws";
const API_BET_BY_ID_URL = "http://localhost:3001/api/bets";
const FRONTEND_CANDIDATES = [
  process.env.FRONTEND_URL,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:4173",
].filter(Boolean);
// A 1 aposta/min, cada amostra espera por um tick (até ~60s). Default = 1.
const SAMPLE_SIZE = Number(process.env.LATENCY_SAMPLE_SIZE || 1);
const LATENCY_MAX_P95_MS = Number(process.env.LATENCY_MAX_P95_MS || 0);

async function resolveFrontendUrl() {
  for (const url of FRONTEND_CANDIDATES) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return url;
    } catch {
      // Tenta a próxima URL.
    }
  }
  throw new Error(`Não foi possível encontrar frontend ativo. URLs testadas: ${FRONTEND_CANDIDATES.join(", ")}`);
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarize(values) {
  const sum = values.reduce((acc, value) => acc + value, 0);
  return { min: Math.min(...values), avg: sum / values.length, p95: percentile(values, 95), max: Math.max(...values) };
}

// Aguarda um "tick" do WS e devolve o latestId que ele transporta.
async function waitForTick(ws) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", onMessage);
      ws.off("error", onError);
      reject(new Error("Timeout a aguardar tick no WebSocket"));
    }, 75000);

    function onMessage(raw) {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === "tick" && Number.isFinite(msg.latestId)) {
          clearTimeout(timeout);
          ws.off("message", onMessage);
          ws.off("error", onError);
          resolve(msg.latestId);
        }
      } catch {
        // Ignora mensagens inesperadas.
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
  while (Date.now() - start < 30000) {
    const response = await request.get(`${API_BET_BY_ID_URL}/${betId}`);
    if (response.status() === 200) return;
    if (response.status() !== 404) throw new Error(`Falha no /api/bets/:id: HTTP ${response.status()}`);
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Aposta ${betId} não apareceu no /api/bets/:id em 30s`);
}

async function getFrontendTotal(page) {
  // .summary-bar → 2.º span = "Total apostas: <strong>N</strong>".
  const raw = await page.locator(".summary-bar span:nth-child(2) strong").innerText();
  return Number(raw.replace(/[^0-9]/g, "") || "0");
}

async function waitFrontendTotalIncrease(page, previousTotal) {
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const current = await getFrontendTotal(page);
    if (current > previousTotal) return current;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error("O frontend não atualizou o total de apostas em 30s");
}

test("mede latência tick → BD → frontend", async ({ page, request }) => {
  test.setTimeout(180000);

  const frontendUrl = await resolveFrontendUrl();
  await page.goto(frontendUrl, { waitUntil: "domcontentloaded" });
  await expect(page.locator("tbody tr .sport-cell").first()).toBeVisible({ timeout: 30000 });

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

  const tickToDb = [];
  const tickToFrontend = [];
  const dbToFrontend = [];

  for (let i = 0; i < SAMPLE_SIZE; i += 1) {
    const totalBefore = await getFrontendTotal(page);

    const latestId = await waitForTick(ws);
    const tTick = Date.now();

    await waitBetInApi(request, latestId);
    const tDb = Date.now();

    await waitFrontendTotalIncrease(page, totalBefore);
    const tFrontend = Date.now();

    tickToDb.push(tDb - tTick);
    tickToFrontend.push(tFrontend - tTick);
    dbToFrontend.push(tFrontend - tDb);
  }

  ws.close();

  const stats = {
    sampleSize: SAMPLE_SIZE,
    tickToDb: summarize(tickToDb),
    tickToFrontend: summarize(tickToFrontend),
    dbToFrontend: summarize(dbToFrontend),
  };
  console.log("LatencyStats", JSON.stringify(stats, null, 2));

  // Guardrail opcional: ativa com LATENCY_MAX_P95_MS (ex.: 5000).
  if (LATENCY_MAX_P95_MS > 0) {
    expect(stats.tickToFrontend.p95).toBeLessThan(LATENCY_MAX_P95_MS);
  }
});
