import express from "express";
import {
  handleGetBetById,
  handleGetGroupedBets,
  handleGetLatestBets,
} from "../controllers/betsController.js";

const router = express.Router();

router.get("/", handleGetLatestBets);
router.get("/grouped", handleGetGroupedBets);
router.get("/:id", handleGetBetById);

export default router;