import express from "express";
import { handleAssistantQuery } from "../controllers/assistantController.js";

const router = express.Router();

// Endpoint para queries do assistant
router.post("/query", handleAssistantQuery);

export default router;
