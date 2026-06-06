import express from "express";
import {
  handleGetBetById,
  handleGetBetsRange,
  handleGetGroupedBets,
  handleGetLatestBets,
  handleGetSports,
  handleGetStakeDistribution,
} from "../controllers/betsController.js";

const router = express.Router();

router.get("/", handleGetLatestBets);
router.get("/grouped", handleGetGroupedBets);
router.get("/sports", handleGetSports);
router.get("/range", handleGetBetsRange);
router.post("/distribution", handleGetStakeDistribution);
router.get("/:id", handleGetBetById);

export default router;