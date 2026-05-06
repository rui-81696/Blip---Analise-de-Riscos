import { getByRisk, getBySport, getSummary } from "../services/statsService.js";

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

    // Se apenas question foi enviada, tratá-la como fallback
    if (!intent) {
      return res.status(400).json({
        error: "Intent JSON é obrigatório para esta fase. Formato: { intent: 'by-sport|summary|by-risk', params: {...} }",
      });
    }

    // Processar conforme o intent
    switch (intent) {
      case "summary": {
        const data = await getSummary({ period: params.period || "24h" });
        return res.json({
          data,
          explanation: `Resumo de apostas para o período ${params.period || "24h"}. Total de apostas: ${data.totalBets}, Stake total: €${data.totalStake.toFixed(2)}, Exposição: €${Math.abs(data.totalExposure).toFixed(2)}`,
        });
      }

      case "by-sport": {
        const data = await getBySport({
          period: params.period || "24h",
          limit: params.limit || 500,
        });
        const summary = data.sports
          .slice(0, 3)
          .map((s) => `${s.sport}: ${s.betCount} apostas, €${s.totalExposure.toFixed(2)} exposição`)
          .join("; ");
        return res.json({
          data,
          explanation: `Estatísticas por desporto para ${params.period || "24h"}. Top 3: ${summary}`,
        });
      }

      case "by-risk": {
        const data = await getByRisk({ period: params.period || "24h" });
        return res.json({
          data,
          explanation: `Distribuição de risco para ${params.period || "24h"}.`,
        });
      }

      default:
        return res.status(400).json({
          error: `Intent '${intent}' não suportado. Use: summary, by-sport, by-risk`,
        });
    }
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao processar query do assistant",
      detail: error.message,
    });
  }
}
