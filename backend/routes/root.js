import express from "express";
import { allEventSelections, oddsMap } from "../generators/odds.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    status: "online",
    combinacoes: allEventSelections.length,
    oddsGeradas: oddsMap.size,
  });
});

export default router;