import { useEffect, useMemo, useState } from "react"
import * as Popover from "@radix-ui/react-popover"
import "./BetAnalysisPopover.scss"
import { formatCurrency } from "../utils/betsAnalytics"

// Faixas de stake por defeito. Intervalos meio-abertos [min, max): uma aposta
// pertence à faixa se `stake >= min && (max === null || stake < max)`.
// `max: null` representa "sem limite superior".
const DEFAULT_RANGES = [
  { id: "micro", label: "Micro", min: 0, max: 1 },
  { id: "baixo", label: "Baixo", min: 1, max: 10 },
  { id: "medio", label: "Médio", min: 10, max: 50 },
  { id: "alto", label: "Alto", min: 50, max: 200 },
  { id: "premium", label: "Premium", min: 200, max: null },
]

// Limiares de concentração (% do total de apostas do grupo numa faixa).
const SUSPECT_THRESHOLD = 50 // vermelho — possível padrão suspeito
const WARN_THRESHOLD = 30 // amarelo — atenção
const RANGES_DEBOUNCE_MS = 350

function cloneDefaultRanges() {
  return DEFAULT_RANGES.map((range) => ({ ...range }))
}

function createRangeId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `range-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function getGroupKey(group) {
  return `${group.sport}|${group.event}|${group.market}|${group.selection}|${group.odds.toFixed(2)}`
}

function normalizeRangeForRequest(range) {
  const hasMax = range.max !== null && range.max !== "" && range.max !== undefined
  return { min: Number(range.min) || 0, max: hasMax ? Number(range.max) : null }
}

function useDebouncedValue(value, delayMs) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [delayMs, value])
  return debounced
}

function getConcentrationLevel(percentage) {
  if (percentage > SUSPECT_THRESHOLD) return "suspect"
  if (percentage > WARN_THRESHOLD) return "warn"
  return "normal"
}

function formatRangeBounds(range) {
  const min = Number(range.min) || 0
  if (range.max === null || range.max === "" || range.max === undefined) {
    return `≥ ${formatCurrency(min)}`
  }
  return `${formatCurrency(min)} – ${formatCurrency(range.max)}`
}

function QuickStat({ label, value }) {
  return (
    <div className="bap-quickstat">
      <span className="bap-quickstat-label">{label}</span>
      <span className="bap-quickstat-value">{value}</span>
    </div>
  )
}

export default function BetAnalysisPopover({ group, timeRange = -1 }) {
  const [open, setOpen] = useState(false)
  const [configMode, setConfigMode] = useState(false)
  // Faixas por instância — cada linha da tabela tem o seu próprio estado.
  const [ranges, setRanges] = useState(cloneDefaultRanges)
  // Resultado vindo do servidor: { stats, distribution } (distribution alinhada
  // por índice com as faixas enviadas).
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const groupKey = getGroupKey(group)
  const debouncedRanges = useDebouncedValue(ranges, RANGES_DEBOUNCE_MS)

  // Pede a distribuição ao servidor (agregação em SQL). Refaz quando o popover
  // abre, quando o período muda, ou quando as faixas mudam (debounced).
  useEffect(() => {
    if (!open) return

    const controller = new AbortController()

    fetch("/api/bets/distribution", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        sport: group.sport,
        event: group.event,
        betType: group.market,
        selection: group.selection,
        odd: group.odds,
        timeRange,
        ranges: debouncedRanges.map(normalizeRangeForRequest),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Erro ${res.status}`)
        }
        return res.json()
      })
      .then((payload) => {
        setResult(payload)
        setError(null)
      })
      .catch((err) => {
        if (err.name === "AbortError") return
        setError(err.message)
      })

    return () => controller.abort()
    // groupKey identifica unicamente o grupo (group muda de referência a cada
    // refresh da tabela, mas a identidade mantém-se).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupKey, timeRange, debouncedRanges])

  const stats = result?.stats ?? { count: 0, avg: 0, min: 0, max: 0 }

  // Junta cada faixa enviada com o respetivo resultado (por índice) e calcula %.
  const distribution = useMemo(() => {
    const buckets = result?.distribution ?? []
    const total = stats.count
    return debouncedRanges.map((range, index) => {
      const bucket = buckets[index] || { count: 0, totalStake: 0 }
      const percentage = total > 0 ? (bucket.count / total) * 100 : 0
      return {
        ...range,
        count: bucket.count,
        totalStake: bucket.totalStake,
        percentage,
        level: getConcentrationLevel(percentage),
      }
    })
  }, [result, debouncedRanges, stats.count])

  // Alerta automático: dispara se alguma faixa concentrar acima do limiar suspeito.
  const alertBucket = useMemo(() => {
    if (stats.count === 0) return null
    const suspicious = distribution
      .filter((bucket) => bucket.percentage > SUSPECT_THRESHOLD)
      .sort((a, b) => b.percentage - a.percentage)
    return suspicious[0] ?? null
  }, [distribution, stats.count])

  function updateRange(id, patch) {
    setRanges((prev) => prev.map((range) => (range.id === id ? { ...range, ...patch } : range)))
  }

  function removeRange(id) {
    setRanges((prev) => prev.filter((range) => range.id !== id))
  }

  function addRange() {
    setRanges((prev) => [...prev, { id: createRangeId(), label: "Nova faixa", min: 0, max: null }])
  }

  function resetRanges() {
    setRanges(cloneDefaultRanges())
  }

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen)
    if (!nextOpen) setConfigMode(false)
  }

  const isLoading = open && result === null && !error

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button type="button" className="bet-count-badge" aria-label={`Analisar ${group.betCount} apostas`}>
          {group.betCount}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          className="bap-content"
          side="left"
          align="start"
          sideOffset={8}
          collisionPadding={12}
        >
          <header className="bap-header">
            <div className="bap-title-block">
              <span className="bap-title">Análise Detalhada</span>
              <span className="bap-subtitle">
                <strong>{stats.count.toLocaleString("pt-PT")}</strong> apostas
              </span>
            </div>

            <div className="bap-header-actions">
              <button
                type="button"
                className={`bap-icon-button ${configMode ? "active" : ""}`}
                onClick={() => setConfigMode((value) => !value)}
                aria-label="Configurar faixas"
                aria-pressed={configMode}
              >
                <GearIcon />
              </button>
              <Popover.Close className="bap-icon-button" aria-label="Fechar">
                <CloseIcon />
              </Popover.Close>
            </div>
          </header>

          {error ? (
            <p className="bap-empty">Não foi possível obter a análise: {error}</p>
          ) : configMode ? (
            <ConfigPanel
              ranges={ranges}
              onUpdate={updateRange}
              onRemove={removeRange}
              onAdd={addRange}
              onReset={resetRanges}
            />
          ) : isLoading ? (
            <p className="bap-empty">A calcular distribuição…</p>
          ) : stats.count === 0 ? (
            <p className="bap-empty">Sem apostas registadas para este grupo.</p>
          ) : (
            <>
              <div className="bap-quickstats">
                <QuickStat label="Stake médio" value={formatCurrency(stats.avg)} />
                <QuickStat label="Stake mín." value={formatCurrency(stats.min)} />
                <QuickStat label="Stake máx." value={formatCurrency(stats.max)} />
              </div>

              {alertBucket && (
                <div className="bap-alert" role="alert">
                  <AlertIcon />
                  <span>
                    <strong>Possível padrão suspeito:</strong> {alertBucket.percentage.toFixed(0)}% das apostas
                    concentram-se na faixa <strong>{alertBucket.label}</strong> ({formatRangeBounds(alertBucket)}).
                  </span>
                </div>
              )}

              <div className="bap-distribution">
                <span className="bap-section-title">Distribuição por faixa de stake</span>
                {distribution.map((bucket) => (
                  <div className="bap-bucket" key={bucket.id}>
                    <div className="bap-bucket-head">
                      <span className="bap-bucket-name">
                        {bucket.label}
                        <span className="bap-bucket-bounds">{formatRangeBounds(bucket)}</span>
                      </span>
                      <span className="bap-bucket-figures">
                        <span className="bap-bucket-count">{bucket.count}</span>
                        <span className="bap-bucket-pct">{bucket.percentage.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="bap-bar-track">
                      <div
                        className={`bap-bar-fill level-${bucket.level}`}
                        style={{ width: `${Math.min(bucket.percentage, 100)}%` }}
                      />
                    </div>
                    <div className="bap-bucket-total">{formatCurrency(bucket.totalStake)} apostados</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <Popover.Arrow className="bap-arrow" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function ConfigPanel({ ranges, onUpdate, onRemove, onAdd, onReset }) {
  return (
    <div className="bap-config">
      <span className="bap-section-title">Configurar faixas</span>

      <div className="bap-config-list">
        {ranges.map((range) => (
          <div className="bap-config-row" key={range.id}>
            <input
              className="bap-config-name"
              type="text"
              value={range.label}
              onChange={(event) => onUpdate(range.id, { label: event.target.value })}
              placeholder="Nome"
              aria-label="Nome da faixa"
            />
            <input
              className="bap-config-num"
              type="number"
              value={range.min}
              min="0"
              step="0.5"
              onChange={(event) => onUpdate(range.id, { min: event.target.value === "" ? 0 : Number(event.target.value) })}
              aria-label="Valor mínimo"
              placeholder="Mín"
            />
            <span className="bap-config-dash">–</span>
            <input
              className="bap-config-num"
              type="number"
              value={range.max === null ? "" : range.max}
              min="0"
              step="0.5"
              onChange={(event) => onUpdate(range.id, { max: event.target.value === "" ? null : Number(event.target.value) })}
              aria-label="Valor máximo (vazio = sem limite)"
              placeholder="∞"
            />
            <button
              type="button"
              className="bap-config-remove"
              onClick={() => onRemove(range.id)}
              aria-label={`Eliminar faixa ${range.label}`}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>

      <div className="bap-config-actions">
        <button type="button" className="bap-btn-secondary" onClick={onAdd}>
          + Adicionar faixa
        </button>
        <button type="button" className="bap-btn-ghost" onClick={onReset}>
          Restaurar padrão
        </button>
      </div>
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}
