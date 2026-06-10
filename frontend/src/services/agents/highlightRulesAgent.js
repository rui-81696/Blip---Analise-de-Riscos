/**
 * Agente de Regras de Highlight — parte do sistema MULTIAGENTE do Risk Assistant.
 *
 * Responsabilidade
 * ----------------
 * Gerir as Regras de Highlight da tabela a partir de linguagem natural:
 *   • adicionar uma regra (campo + operador + valor)
 *   • ativar / desativar / remover regras (por nome ou por campo)
 *   • limpar todas
 *   • listar as regras atuais
 *
 * Porquê um agente dedicado?
 * --------------------------
 * O parsing do pedido (campo/operador/valor, com tolerância a erros) é a única
 * parte que beneficia do LLM; a APLICAÇÃO e a CONFIRMAÇÃO são determinísticas e
 * corretas por construção. Tal como o [[analyticsAgent]], este módulo é AUTÓNOMO
 * no caminho determinístico: não importa o WebLLM. A leitura via LLM é injetada
 * pelo orquestrador (webllmClient) através da função `parse` — assim o agente não
 * tem dependências do motor e é facilmente testável.
 *
 * As PRIMITIVAS de domínio (campos, validação, parser heurístico, deteção de
 * intenção) vivem em utils/highlightRules.js; este agente é só a ORQUESTRAÇÃO.
 */

import {
  RULE_FIELDS,
  isValidField,
  isValidOperator,
  matchField,
  getFieldLabel,
  getOperatorLabel,
  formatRulePreview,
  createDefaultRule,
  parseRuleHeuristic,
  normalizeText,
} from "../../utils/highlightRules";

// ─── Descrição do estado (para prompt e respostas) ──────────────────────────

function listFieldsSentence() {
  return RULE_FIELDS.map((field) => field.label).join(", ");
}

function describeRules(rules) {
  if (!rules || rules.length === 0) return "(nenhuma regra definida)";
  return rules
    .map((rule, index) => `${index + 1}. "${rule.name}" — ${getFieldLabel(rule.field)} ${getOperatorLabel(rule.operator)} ${rule.value} [${rule.active ? "ativa" : "inativa"}]`)
    .join("\n");
}

// ─── Prompt de parsing (usado pelo orquestrador, que é o dono do motor) ──────

/**
 * Constrói o prompt que pede ao LLM para extrair {action, field, operator,
 * value, target} do pedido em linguagem natural. O orquestrador (webllmClient)
 * é quem chama o engine com este prompt; aqui só o construímos.
 */
export function buildRulePrompt(question, rules) {
  return [
    "You manage highlight rules for a sports-betting risk dashboard table.",
    "The user writes in Portuguese or English and MAY contain typos — understand the intent.",
    "",
    "Numeric fields (output the EXACT key):",
    "- totalStake (Stake Total / total apostado)",
    "- betCount (Nº de apostas / número de apostas)",
    "- totalExposure (Exposição)",
    "- odds (Odds / cotação)",
    "",
    'Operators: ">", ">=", "<", "<=", "=", "!=".',
    'Map natural language: maior/acima → ">"; "maior ou igual"/"pelo menos" → ">="; menor/abaixo → "<"; "menor ou igual"/"no máximo" → "<="; igual → "="; diferente → "!=".',
    "",
    "Actions: add, activate, deactivate, remove, clear, list, none.",
    '- create/add/"destaca linhas onde"/"marca" → add',
    '- enable → activate; disable → deactivate; delete one → remove; delete all → clear; "que regras tenho" → list; not about rules → none.',
    "",
    "Current rules:",
    describeRules(rules),
    "",
    "Output STRICT JSON only, no prose:",
    '{"action":"add|activate|deactivate|remove|clear|list|none","field":"<key|null>","operator":"<op|null>","value":<number|null>,"target":"<text|null>"}',
    "- If the requested field is NOT in the list above, set field to null.",
    '- For activate/deactivate/remove, "target" = the rule name or field mentioned, or "todas".',
    "",
    `Question: ${question}`,
    "JSON:",
  ].join("\n");
}

// ─── Parsing + aplicação determinísticos ────────────────────────────────────

// Combina a saída do LLM com o parser heurístico (preenche campos em falta).
function backfillRuleParse(parsed, question) {
  const heuristic = parseRuleHeuristic(question);
  const rawField = parsed && parsed.field;
  const field = isValidField(rawField) ? rawField : matchField(String(rawField || "")) || heuristic.field;
  const operator = isValidOperator(parsed && parsed.operator) ? parsed.operator : heuristic.operator;
  const value = Number.isFinite(Number(parsed && parsed.value)) ? Number(parsed.value) : heuristic.value;
  const validActions = new Set(["add", "activate", "deactivate", "remove", "clear", "list", "none"]);
  const action = parsed && validActions.has(String(parsed.action)) ? parsed.action : heuristic.action;
  const target = (parsed && typeof parsed.target === "string" && parsed.target) || heuristic.target;

  return { action, field, operator, value, target };
}

function findTargetRuleIds(rules, target) {
  const normalized = normalizeText(target || "");
  if (rules.length === 0) return [];
  if (!normalized) return rules.length === 1 ? [rules[0].id] : null;
  if (/\b(todas|todos|tudo|all)\b/.test(normalized)) return rules.map((rule) => rule.id);

  const field = matchField(target);
  let matches = field ? rules.filter((rule) => rule.field === field) : [];

  if (matches.length === 0) {
    matches = rules.filter((rule) => {
      const name = normalizeText(rule.name);
      return name && (normalized.includes(name) || name.includes(normalized));
    });
  }

  if (matches.length === 0 && rules.length === 1) return [rules[0].id];
  return matches.length > 0 ? matches.map((rule) => rule.id) : null;
}

/**
 * Aplica a ação parseada às regras atuais. Determinístico por construção.
 * @returns {{ nextRules: Array, reply: string }}
 */
export function applyRuleAction(parsed, rules) {
  const safeRules = Array.isArray(rules) ? rules : [];
  const action = parsed.action;

  if (action === "list") {
    return {
      nextRules: safeRules,
      reply: safeRules.length
        ? `Regras atuais:\n${describeRules(safeRules)}`
        : `Ainda não há regras definidas. Campos disponíveis: ${listFieldsSentence()}.`,
    };
  }

  if (action === "add") {
    if (!isValidField(parsed.field)) {
      return {
        nextRules: safeRules,
        reply: `Não consigo criar essa regra — esse campo não é suportado. Campos disponíveis: ${listFieldsSentence()}. Operadores: maior (>), maior ou igual (>=), menor (<), menor ou igual (<=), igual (=), diferente (!=).`,
      };
    }
    if (parsed.value === null || parsed.value === undefined || !Number.isFinite(Number(parsed.value))) {
      return {
        nextRules: safeRules,
        reply: `Falta o valor numérico. Exemplo: "${getFieldLabel(parsed.field)} maior que 8000".`,
      };
    }
    const operator = isValidOperator(parsed.operator) ? parsed.operator : ">";
    const value = Number(parsed.value);
    const rule = createDefaultRule({
      field: parsed.field,
      operator,
      value,
      name: `${getFieldLabel(parsed.field)} ${getOperatorLabel(operator)} ${value}`,
    });
    return { nextRules: [...safeRules, rule], reply: `Regra adicionada e ativa: ${formatRulePreview(rule)}.` };
  }

  if (action === "clear") {
    if (safeRules.length === 0) return { nextRules: safeRules, reply: "Já não havia regras para remover." };
    return { nextRules: [], reply: `Removi todas as regras (${safeRules.length}).` };
  }

  if (action === "remove" || action === "activate" || action === "deactivate") {
    if (safeRules.length === 0) return { nextRules: safeRules, reply: "Ainda não há regras definidas." };

    const ids = findTargetRuleIds(safeRules, parsed.target || getFieldLabel(parsed.field) || "");
    if (!ids || ids.length === 0) {
      return { nextRules: safeRules, reply: `Não percebi a que regra te referes. Regras atuais:\n${describeRules(safeRules)}` };
    }

    if (action === "remove") {
      const removed = safeRules.filter((rule) => ids.includes(rule.id));
      return {
        nextRules: safeRules.filter((rule) => !ids.includes(rule.id)),
        reply: `Removi ${removed.length} regra(s): ${removed.map((rule) => formatRulePreview(rule)).join("; ")}.`,
      };
    }

    const active = action === "activate";
    return {
      nextRules: safeRules.map((rule) => (ids.includes(rule.id) ? { ...rule, active } : rule)),
      reply: `${active ? "Ativei" : "Desativei"} ${ids.length} regra(s).`,
    };
  }

  return {
    nextRules: safeRules,
    reply: `Posso gerir as Regras de Highlight. Campos: ${listFieldsSentence()}. Operadores: maior (>), maior ou igual (>=), menor (<), menor ou igual (<=), igual (=), diferente (!=). Ex.: "adiciona uma regra: stake total maior que 8000".`,
  };
}

// ─── Caminho de execução do agente ──────────────────────────────────────────

/**
 * Gere as Regras de Highlight a partir de linguagem natural. Determinístico por
 * construção; se for fornecida uma função `parse` (LLM, dona do motor no
 * orquestrador), usa-a para extrair a intenção — caindo sempre no parser
 * heurístico para campos em falta (backfill).
 *
 * @param {object}   args
 * @param {string}   args.question
 * @param {Array}    args.rules         regras atuais
 * @param {Function} [args.parse]       async ({question, rules}) => parsedJson|null
 * @param {Function} [args.emit]        (text) => void   (entrega da reply ao UI)
 * @returns {Promise<{ nextRules: Array, reply: string }>}
 */
export async function manageHighlightRules({ question, rules = [], parse, emit }) {
  let parsedFromLlm = null;
  if (typeof parse === "function") {
    try {
      parsedFromLlm = await parse({ question, rules });
    } catch {
      parsedFromLlm = null;
    }
  }

  const parsed = backfillRuleParse(parsedFromLlm || {}, question);
  const result = applyRuleAction(parsed, rules);

  if (typeof emit === "function") {
    try { emit(result.reply); } catch { /* ignore */ }
  }
  return result;
}
