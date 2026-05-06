import express from "express";
import {
  handleGetSummary,
  handleGetBySport,
  handleGetByPeriod,
  handleGetByRisk,
} from "../controllers/statsController.js";

const router = express.Router();

// Endpoints de estatísticas
router.get("/summary", handleGetSummary);
router.get("/by-sport", handleGetBySport);
router.get("/by-period", handleGetByPeriod);
router.get("/by-risk", handleGetByRisk);

export default router;
