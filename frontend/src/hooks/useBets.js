import { useEffect, useState } from "react";

const API_URL = "/api/bets?limit=200";
const POLL_INTERVAL_MS = 1000;

export function useBets() {
  const [bets, setBets] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | open | closed
  const [stats, setStats] = useState({ total: 0, initialDone: false });

  useEffect(() => {
    let cancelled = false;

    async function fetchBets() {
      try {
        const response = await fetch(API_URL, { cache: "no-store" });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (cancelled) {
          return;
        }

        const normalized = (data.bets ?? []).map((bet) => ({
          id: bet.id,
          sport: bet.sport,
          event: bet.event,
          betType: bet.bet_type,
          selection: bet.selection,
          odd: Number(bet.odd),
          stake: Number(bet.stake),
          riskScore: bet.risk_score,
          exposureRisk: bet.exposure_risk,
          timestamp: bet.timestamp,
        }));

        setBets(normalized);
        setStats({
          total: data.total ?? normalized.length,
          initialDone: true,
        });
        setStatus("open");
      } catch {
        if (!cancelled) {
          setStatus("closed");
        }
      }
    }

    fetchBets();
    const interval = setInterval(fetchBets, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { bets, status, stats };
}
