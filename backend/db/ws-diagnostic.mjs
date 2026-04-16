import WebSocket from "ws";

const started = Date.now();
const ws = new WebSocket("ws://localhost:3001/ws");
let initialChunks = 0;
let liveMsgs = 0;
let totalBets = 0;

ws.on("open", () => {
  console.log("OPEN");
});

ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "initial") {
    initialChunks += 1;
    totalBets += Array.isArray(msg.bets) ? msg.bets.length : 0;
  }
  if (msg.type === "live") {
    liveMsgs += 1;
    totalBets += Array.isArray(msg.bets) ? msg.bets.length : 0;
  }
});

ws.on("close", (code, reason) => {
  console.log("CLOSE", code, reason.toString(), "uptimeMs", Date.now() - started, "initialChunks", initialChunks, "liveMsgs", liveMsgs, "totalBets", totalBets);
  process.exit(0);
});

ws.on("error", (error) => {
  console.log("ERROR", error.message);
  process.exit(1);
});

setInterval(() => {
  console.log("TICK", "uptimeMs", Date.now() - started, "initialChunks", initialChunks, "liveMsgs", liveMsgs, "totalBets", totalBets, "readyState", ws.readyState);
}, 2000);

setTimeout(() => {
  console.log("DONE", "uptimeMs", Date.now() - started, "initialChunks", initialChunks, "liveMsgs", liveMsgs, "totalBets", totalBets, "readyState", ws.readyState);
  ws.close(1000, "test-done");
}, 15000);
