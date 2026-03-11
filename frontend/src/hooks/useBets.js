import { useEffect, useRef, useState } from "react";

const WS_URL = "ws://localhost:3001/ws";

export function useBets() {
  const [bets, setBets] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | open | closed
  const [stats, setStats] = useState({ total: 0, initialDone: false });
  const wsRef = useRef(null);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setStatus("open");

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);

      if (msg.type === "initial") {
        // Acumular apostas iniciais — guardar só as últimas 200 para a tabela
        setBets((prev) => [...msg.bets.slice(-200), ...prev].slice(0, 200));
        setStats((prev) => ({
          ...prev,
          total: prev.total + msg.bets.length,
        }));
      }

      if (msg.type === "live") {
        // Novas apostas aparecem no topo
        setBets((prev) => [...msg.bets, ...prev].slice(0, 200));
        setStats((prev) => ({
          ...prev,
          total: prev.total + msg.bets.length,
          initialDone: true,
        }));
      }
    };

    ws.onclose = () => setStatus("closed");
    ws.onerror = () => setStatus("closed");

    return () => ws.close();
  }, []);

  return { bets, status, stats };
}
