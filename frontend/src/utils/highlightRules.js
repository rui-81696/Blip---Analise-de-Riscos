/**
 * Regras de Highlight Personalizadas.
 *
 * O analista define condições numéricas (ex.: "Stake Total > 8000"). Cada regra
 * ativa atua de forma independente: uma linha é destacada se satisfizer QUALQUER
 * regra ativa. Quando uma linha cumpre mais do que uma regra, a cor usada segue a
 * ordem das regras na lista (a primeira regra tem prioridade).
 *
 * Este módulo é a fonte de verdade partilhada entre:
 *  - o painel (HighlightRulesSheet),
 *  - a aplicação do highlight na tabela (GroupedBetsTable),
 *  - a gestão por linguagem natural (assistente WebLLM).
 *
 * Interface de uma regra:
 *   { id, name, field, operator, value, color, active }
 */

// ─── Campos numéricos disponíveis (adaptados à linha agregada da tabela) ────
export const RULE_FIELDS = [
  {
    key: "totalStake",
    label: "Stake Total",
    aliases: ["total stake", "stake total", "total apostado", "valor apostado", "montante apostado", "total de stake", "stake"],
  },
  {
    key: "betCount",
    label: "Nº de Apostas",
    aliases: ["bet count", "numero de apostas", "número de apostas", "nº de apostas", "n de apostas", "quantidade de apostas", "total de apostas", "apostas"],
  },
  {
    key: "totalExposure",
    label: "Exposição",
    aliases: ["exposure", "exposicao", "exposição", "total exposure", "exposicao total", "exposição total"],
  },
  {
    key: "odds",
    label: "Odds",
    aliases: ["odds", "odd", "cotacao", "cotação"],
  },
]

const FIELD_KEYS = new Set(RULE_FIELDS.map((f) => f.key))

// ─── Operadores (ordem importa: compostos antes dos simples no matching) ────
export const RULE_OPERATORS = [
  { key: ">=", label: "≥", aliases: ["maior ou igual", "maior igual", "pelo menos", "no minimo", "no mínimo", "ao menos", ">=", "=>", "≥"] },
  { key: "<=", label: "≤", aliases: ["menor ou igual", "menor igual", "no maximo", "no máximo", "ate", "até", "<=", "=<", "≤"] },
  { key: "!=", label: "≠", aliases: ["diferente de", "diferente", "nao igual", "não igual", "nao seja", "!=", "<>", "≠"] },
  { key: ">", label: ">", aliases: ["maior que", "maior do que", "maior", "acima de", "acima", "superior a", "superior", "mais de", ">"] },
  { key: "<", label: "<", aliases: ["menor que", "menor do que", "menor", "abaixo de", "abaixo", "inferior a", "inferior", "menos de", "<"] },
  { key: "=", label: "=", aliases: ["igual a", "igual", "exatamente", "exato", "="] },
]

const OPERATOR_KEYS = new Set(RULE_OPERATORS.map((o) => o.key))

// ─── Paleta de cores (chave → estilos coerentes com o tema dark) ────────────
export const RULE_COLORS = [
  { key: "red", label: "Vermelho", border: "#ff6b6b", bg: "rgba(210, 64, 64, 0.12)" },
  { key: "orange", label: "Laranja", border: "#ffbf69", bg: "rgba(214, 142, 27, 0.12)" },
  { key: "purple", label: "Roxo", border: "#a855f7", bg: "rgba(168, 85, 247, 0.2)" },
  { key: "blue", label: "Azul", border: "#4a90e2", bg: "rgba(74, 144, 226, 0.12)" },
  { key: "green", label: "Verde", border: "#81c784", bg: "rgba(76, 175, 80, 0.12)" },
]

const COLOR_MAP = new Map(RULE_COLORS.map((c) => [c.key, c]))

// ─── Factories e helpers ────────────────────────────────────────────────────

export function createRuleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createDefaultRule(overrides = {}) {
  return {
    id: createRuleId(),
    name: "Nova regra",
    field: "totalStake",
    operator: ">",
    value: 8000,
    color: "red",
    active: true,
    ...overrides,
  }
}

export function getFieldLabel(fieldKey) {
  return RULE_FIELDS.find((f) => f.key === fieldKey)?.label ?? fieldKey
}

export function getOperatorLabel(operatorKey) {
  return RULE_OPERATORS.find((o) => o.key === operatorKey)?.label ?? operatorKey
}

export function getColor(colorKey) {
  return COLOR_MAP.get(colorKey) ?? RULE_COLORS[0]
}

export function isValidField(fieldKey) {
  return FIELD_KEYS.has(fieldKey)
}

export function isValidOperator(operatorKey) {
  return OPERATOR_KEYS.has(operatorKey)
}

/** Texto de preview de uma regra, ex.: "Stake Total > 8000". */
export function formatRulePreview(rule) {
  if (!rule) return ""
  const value = Number.isFinite(Number(rule.value)) ? Number(rule.value) : "?"
  return `${getFieldLabel(rule.field)} ${getOperatorLabel(rule.operator)} ${value}`
}

// ─── Avaliação (puras e reutilizáveis) ──────────────────────────────────────

/**
 * Avalia UMA regra contra UMA linha. Pura: compara o valor do campo com o
 * valor da regra usando o operador. Ignora o estado active (isso é tratado
 * em getRowHighlight). Devolve false se os valores não forem numéricos.
 */
export function evaluateRule(rule, row) {
  if (!rule || !row) return false
  const value = Number(row[rule.field])
  const target = Number(rule.value)
  if (!Number.isFinite(value) || !Number.isFinite(target)) return false

  switch (rule.operator) {
    case ">":
      return value > target
    case ">=":
      return value >= target
    case "<":
      return value < target
    case "<=":
      return value <= target
    case "=":
      return value === target
    case "!=":
      return value !== target
    default:
      return false
  }
}

/**
 * Devolve o estilo de highlight da linha (ou null). Cada regra ativa é avaliada
 * de forma independente: a linha é destacada se cumprir PELO MENOS UMA regra
 * ativa. Quando cumpre mais do que uma, vence a PRIMEIRA regra ativa (por ordem
 * da lista) que a linha satisfaz — ou seja, a ordem das regras define a
 * prioridade da cor.
 */
export function getRowHighlight(rules, row) {
  const active = (rules || []).filter((rule) => rule.active)
  if (active.length === 0) return null

  // Primeira regra ativa, por ordem, que a linha satisfaz (prioridade por ordem).
  const matched = active.find((rule) => evaluateRule(rule, row))
  if (!matched) return null

  const color = getColor(matched.color)
  return {
    borderColor: color.border,
    background: color.bg,
    ruleId: matched.id,
    ruleName: matched.name,
  }
}

export function countActiveRules(rules) {
  return (rules || []).filter((rule) => rule.active).length
}

// ─── Matching de linguagem natural (fallback heurístico do assistente) ──────

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function levenshtein(a, b) {
  if (a === b) return 0
  if (!a) return b.length
  if (!b) return a.length
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[a.length][b.length]
}

// Procura uma alias num texto, tolerando pequenos erros ortográficos.
function textContainsAlias(normalizedText, alias) {
  const normAlias = normalizeText(alias)
  if (!normAlias) return false
  if (normalizedText.includes(normAlias)) return true

  // Tolerância a erros: compara a alias com janelas de palavras do texto.
  const aliasWords = normAlias.split(" ")
  const textWords = normalizedText.split(" ")
  const tolerance = normAlias.length <= 4 ? 1 : 2

  for (let i = 0; i + aliasWords.length <= textWords.length; i += 1) {
    const window = textWords.slice(i, i + aliasWords.length).join(" ")
    if (levenshtein(window, normAlias) <= tolerance) return true
  }
  return false
}

/** Tenta identificar o campo referido num texto livre. */
export function matchField(text) {
  const normalized = normalizeText(text)
  if (!normalized) return null

  let best = null
  let bestLen = 0
  for (const field of RULE_FIELDS) {
    for (const alias of field.aliases) {
      if (textContainsAlias(normalized, alias) && alias.length > bestLen) {
        best = field.key
        bestLen = alias.length
      }
    }
  }
  return best
}

/** Tenta identificar o operador referido num texto livre. */
export function matchOperator(text) {
  const normalized = normalizeText(text)
  if (!normalized) return null

  // RULE_OPERATORS já está ordenado com os compostos primeiro.
  for (const operator of RULE_OPERATORS) {
    for (const alias of operator.aliases) {
      if (textContainsAlias(normalized, alias)) return operator.key
    }
  }
  return null
}

const RULE_INTENT_STEMS = ["regra", "highlight", "destac", "realc", "marca", "realç"]

/** Heurística (tolerante a erros) para decidir se a mensagem é sobre regras. */
export function isRuleManagementIntent(question) {
  const normalized = normalizeText(question)
  return RULE_INTENT_STEMS.some((stem) => normalized.includes(normalizeText(stem)))
}

// Nota: usamos prefixos (fronteira só à esquerda) para apanhar flexões — ex.:
// "\bdesativ" casa "desativa", "desativar", "desativadas".
function detectAction(normalized) {
  if (/\b(remov|apaga|elimina|tira)/.test(normalized)) {
    if (/\b(todas|tudo|todos)\b/.test(normalized)) return "clear"
    return "remove"
  }
  if (/\b(desativ|desliga|inativ|desabilita)/.test(normalized)) return "deactivate"
  if (/\b(ativa|ativar|liga|habilita|reativa)/.test(normalized)) return "activate"
  if (/\b(lista|listar|mostra|mostrar|quais|que regras|ver regras)/.test(normalized)) return "list"
  if (/\b(adiciona|cria|criar|nova|novo|acrescenta|destac|realc|marca)/.test(normalized)) return "add"
  return null
}

/**
 * Parser heurístico (fallback). Extrai uma ação estruturada do texto livre.
 * Devolve { action, field, operator, value, target }.
 */
export function parseRuleHeuristic(question) {
  const normalized = normalizeText(question)
  const field = matchField(question)
  const operator = matchOperator(question)

  const numberMatch = String(question).replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/)
  const value = numberMatch ? Number(numberMatch[0].replace(",", ".")) : null

  let action = detectAction(normalized)
  if (!action && field && operator && value !== null) action = "add"

  return { action, field, operator, value, target: normalized }
}