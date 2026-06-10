/**
 * Agente de Risco (Anomalias / Briefing) — parte do sistema MULTIAGENTE do
 * Risk Assistant.
 *
 * Responsabilidade
 * ----------------
 * Produzir o briefing operacional de risco a partir das anomalias REAIS
 * detetadas pela tool `detect-anomalies`: volume-spike, stake-surge,
 * selection-concentration e single-exposure, cada uma com a ação tática
 * sugerida (fundamentada no ESTUDO_ANALISTA.md).
 *
 * Porquê um agente dedicado e DETERMINÍSTICO?
 * -------------------------------------------
 * Um analista não pode agir sobre alertas inventados. A deteção (tool) e a
 * composição do briefing são determinísticas — corretas por construção. Tal como
 * o [[analyticsAgent]] e o [[highlightRulesAgent]], este módulo é AUTÓNOMO: não
 * importa o WebLLM. A entrega ao UI é injetada pelo orquestrador (webllmClient)
 * via `emit`.
 */

import { runTool } from "../../utils/betsAnalytics";

// Resposta tática de analista para cada tipo de anomalia detetada (grounded no
// estudo: dicotomia financeiro vs comportamental, dimensão temporal, resposta
// proporcional). Usada para compor o briefing de forma determinística.
const ANOMALY_TACTICS = {
  "volume-spike":
    "Compressão temporal de volume. Distinguir 'square money' diluído (benigno) de injeção coordenada (fuga de informação / sinal de sindicato). Rever liquidez do mercado; suspender temporariamente se for nicho.",
  "stake-surge":
    "Subida anormal do stake médio — possível sharp/value betting ou sindicato. Se for jogo legal, conter com stake factoring (reduzir o fator), não bloquear; usar como radar de preço.",
  "selection-concentration":
    "Concentração unilateral aumenta a liability. Se o evento for de baixa liquidez/nicho, prioridade máxima (risco de integridade). Rever exposição, ajustar a linha e escalar se o mercado for obscuro.",
  "single-exposure":
    "Liability concentrada numa única aposta. Rever limite e aplicar stake factoring para conter a exposição marginal. Por si só não é fraude.",
};

// Briefing determinístico e fundamentado a partir das anomalias REAIS detetadas.
// Determinístico por design: um analista não pode agir sobre alertas inventados.
export function buildRiskBriefing(anomalies) {
  const highCount = anomalies.filter((anomaly) => anomaly.severity === "high").length;
  const intro =
    highCount > 0
      ? `⚠ ${anomalies.length} ${anomalies.length === 1 ? "alerta" : "alertas"} — recomenda-se revisão imediata.`
      : `Atenção pontual: ${anomalies.length} ${anomalies.length === 1 ? "sinal" : "sinais"} a monitorizar.`;

  const bullets = anomalies
    .map((anomaly) => {
      const tactic = ANOMALY_TACTICS[anomaly.kind] || "Monitorizar e cruzar com outros sinais antes de agir.";
      return `• [${String(anomaly.severity).toUpperCase()}] ${anomaly.title} — ${anomaly.detail}\n   Ação sugerida: ${tactic}`;
    })
    .join("\n");

  return `${intro}\n\n${bullets}\n\nLembrete: um sinal isolado é ruído; confirma a sobreposição de sinais antes de qualquer medida coerciva.`;
}

/**
 * Executa a análise de risco: corre `detect-anomalies` e devolve um briefing
 * curto com ações sugeridas. Determinístico por construção.
 *
 * @param {object}   args
 * @param {Array}    args.bets
 * @param {Function} [args.emit]   (text) => void   (entrega final ao UI)
 * @returns {string} o briefing produzido
 */
export function runRiskAnalysis({ bets, emit }) {
  const toolResult = runTool("detect-anomalies", bets, {});
  const anomalies = toolResult.data?.anomalies || [];

  const text =
    anomalies.length === 0
      ? "✅ Operação estável — sem padrões anómalos nas janelas analisadas (volume, concentração e exposição dentro do normal)."
      : buildRiskBriefing(anomalies);

  if (typeof emit === "function") {
    try { emit(text); } catch { /* ignore */ }
  }
  return text;
}
