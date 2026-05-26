import { answerAssistantQuery } from "../services/assistantService.js";

/**
 * POST /api/assistant/query
 * Processa uma query do assistant (pode receber intent JSON ou texto livre)
 */
export async function handleAssistantQuery(req, res) {
  try {
    const { intent, params = {}, question } = req.body;

    if (!intent && !question) {
      return res.status(400).json({
        error: "Envie 'intent' (JSON) ou 'question' (texto)",
      });
    }

    const result = await answerAssistantQuery({ intent, params, question });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao processar query do assistant",
      detail: error.message,
    });
  }
}
