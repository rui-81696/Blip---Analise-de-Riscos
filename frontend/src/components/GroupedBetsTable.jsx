import { useEffect, useState } from "react"
import "./GroupedBetsTable.scss"
import BetAnalysisPopover from "./BetAnalysisPopover"

const WS_RECONNECT_DELAY_MS = 1000
const FILTER_DEBOUNCE_MS = 300
const REFRESH_THROTTLE_MS = 1000
const MAX_GROUP_ROWS = 500

function useDebouncedValue(value, delayMs) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedValue(value)
    }, delayMs)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [delayMs, value])

  return debouncedValue
}

function getWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws"

  if (window.location.hostname === "localhost") {
    return `${protocol}://localhost:3001/ws`
  }

  return `${protocol}://${window.location.host}/ws`
}

function formatTimeAgo(isoDate) {
  const date = new Date(isoDate)
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)

  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function getHighlightClass(group) {
  if (group.totalStake > 8000) return "row-highlight-red"
  if (group.betCount > 500) return "row-highlight-orange"
  return ""
}

// Mapeia a linha agregada do endpoint (snake_case) para a forma usada na UI.
function mapGroup(row) {
  return {
    sport: row.sport,
    event: row.event,
    market: row.market,
    selection: row.selection,
    odds: Number(row.odds),
    betCount: row.bet_count,
    totalStake: row.total_stake,
    totalExposure: row.total_exposure,
    lastBetPlacedAt: row.last_bet_placed_at,
  }
}

function SortButton({ label, field, sortField, sortOrder, onSort }) {
  const isActive = sortField === field

  return (
    <button type="button" className={`sort-button ${isActive ? "active" : ""}`} onClick={() => onSort(field)}>
      <span>{label}</span>
      <span className="sort-indicator">{isActive ? (sortOrder === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  )
}

export default function GroupedBetsTable() {
  const [searchText, setSearchText] = useState("")
  const [selectedSport, setSelectedSport] = useState("all")
  const [minOdds, setMinOdds] = useState("")
  const [maxOdds, setMaxOdds] = useState("")
  const [minBets, setMinBets] = useState(0)
  const [minStake, setMinStake] = useState(0)
  const [maxStake, setMaxStake] = useState("")
  const [timeRange, setTimeRange] = useState(-1)
  const [sortField, setSortField] = useState("totalExposure")
  const [sortOrder, setSortOrder] = useState("desc")

  const [sports, setSports] = useState(["all"])
  const [status, setStatus] = useState("connecting")
  const [groupedData, setGroupedData] = useState([])
  const [summary, setSummary] = useState({ totalGroups: 0, totalBets: 0, totalExposure: 0 })
  const [error, setError] = useState(null)
  // Bumped sempre que o WS avisa que há dados novos (throttled) → refaz o fetch.
  const [refreshNonce, setRefreshNonce] = useState(0)

  const debouncedSearchText = useDebouncedValue(searchText, FILTER_DEBOUNCE_MS)
  const debouncedSelectedSport = useDebouncedValue(selectedSport, FILTER_DEBOUNCE_MS)
  const debouncedMinOdds = useDebouncedValue(minOdds, FILTER_DEBOUNCE_MS)
  const debouncedMaxOdds = useDebouncedValue(maxOdds, FILTER_DEBOUNCE_MS)
  const debouncedMinBets = useDebouncedValue(minBets, FILTER_DEBOUNCE_MS)
  const debouncedMinStake = useDebouncedValue(minStake, FILTER_DEBOUNCE_MS)
  const debouncedMaxStake = useDebouncedValue(maxStake, FILTER_DEBOUNCE_MS)
  const debouncedTimeRange = useDebouncedValue(timeRange, FILTER_DEBOUNCE_MS)

  // ── Lista de desportos (uma vez) ────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/bets/sports", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { sports: [] }))
      .then((data) => setSports(["all", ...(data.sports || [])]))
      .catch(() => {
        /* mantém apenas "all" se falhar */
      })

    return () => controller.abort()
  }, [])

  // ── Agregados via REST: refaz quando os filtros mudam ou chega um tick ───
  useEffect(() => {
    const controller = new AbortController()

    const params = new URLSearchParams()
    const search = debouncedSearchText.trim()
    if (search) params.set("search", search)
    if (debouncedSelectedSport !== "all") params.set("sport", debouncedSelectedSport)
    if (debouncedMinOdds !== "") params.set("minOdds", String(debouncedMinOdds))
    if (debouncedMaxOdds !== "") params.set("maxOdds", String(debouncedMaxOdds))
    if (debouncedMinStake) params.set("minStake", String(debouncedMinStake))
    if (debouncedMaxStake !== "") params.set("maxStake", String(debouncedMaxStake))
    if (debouncedMinBets) params.set("minBets", String(debouncedMinBets))
    params.set("timeRange", String(debouncedTimeRange))
    params.set("sortField", sortField)
    params.set("sortOrder", sortOrder)
    params.set("limit", String(MAX_GROUP_ROWS))

    fetch(`/api/bets/grouped?${params.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Erro ${res.status}`)
        }
        return res.json()
      })
      .then((data) => {
        setGroupedData((data.groups || []).map(mapGroup))
        setSummary({
          totalGroups: data.totalGroups || 0,
          totalBets: data.totalBets || 0,
          totalExposure: data.totalExposure || 0,
        })
        setError(null)
      })
      .catch((err) => {
        if (err.name === "AbortError") return
        setError(err.message)
      })

    return () => controller.abort()
  }, [
    debouncedSearchText,
    debouncedSelectedSport,
    debouncedMinOdds,
    debouncedMaxOdds,
    debouncedMinStake,
    debouncedMaxStake,
    debouncedMinBets,
    debouncedTimeRange,
    sortField,
    sortOrder,
    refreshNonce,
  ])

  // ── WebSocket: só "tick" → agenda um refresh throttled ───────────────────
  useEffect(() => {
    let ws = null
    let isUnmounting = false
    let reconnectTimer = null
    let refreshTimer = null

    const scheduleRefresh = () => {
      if (refreshTimer) return
      refreshTimer = setTimeout(() => {
        refreshTimer = null
        setRefreshNonce((nonce) => nonce + 1)
      }, REFRESH_THROTTLE_MS)
    }

    const connect = () => {
      if (isUnmounting) return

      setStatus("connecting")
      ws = new WebSocket(getWebSocketUrl())

      ws.onopen = () => setStatus("open")

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type === "tick") scheduleRefresh()
        } catch {
          // ignora mensagens inválidas
        }
      }

      ws.onerror = () => setStatus("closed")

      ws.onclose = () => {
        if (isUnmounting) return
        setStatus("connecting")
        reconnectTimer = setTimeout(connect, WS_RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      isUnmounting = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (refreshTimer) clearTimeout(refreshTimer)
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.close()
    }
  }, [])

  function handleSort(field) {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
      return
    }

    setSortField(field)
    setSortOrder("desc")
  }

  function clearFilters() {
    setSearchText("")
    setSelectedSport("all")
    setMinOdds("")
    setMaxOdds("")
    setMinBets(0)
    setMinStake(0)
    setMaxStake("")
    setTimeRange(-1)
  }

  return (
    <div className="grouped-bets-view">
      <h1>Análise de Riscos - Apostas Agrupadas</h1>

      <div className="grouped-filters">
        <div className="filter-item search-box">
          <input
            id="searchText"
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Pesquisar ID"
          />
        </div>

        <div className="filter-item compact sport-select">
          <select id="sportSelect" value={selectedSport} onChange={(e) => setSelectedSport(e.target.value)}>
            {sports.map((sport) => (
              <option key={sport} value={sport}>
                {sport === "all" ? "Desporto: Todos" : sport}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-item compact">
          <input
            id="minOdds"
            type="number"
            value={minOdds}
            onChange={(e) => setMinOdds(e.target.value === "" ? "" : Number(e.target.value))}
            min="1"
            step="0.1"
            placeholder="Odds Mín"
          />
        </div>

        <div className="filter-item compact">
          <input
            id="maxOdds"
            type="number"
            value={maxOdds}
            onChange={(e) => setMaxOdds(e.target.value === "" ? "" : Number(e.target.value))}
            min="1"
            step="0.1"
            placeholder="Odds Máx"
          />
        </div>

        <div className="filter-item compact">
          <input
            id="minBets"
            type="number"
            value={minBets || ""}
            onChange={(e) => setMinBets(Number(e.target.value) || 0)}
            min="0"
            placeholder="Apostas Mín"
          />
        </div>

        <div className="filter-item compact">
          <input
            id="minStake"
            type="number"
            value={minStake || ""}
            onChange={(e) => setMinStake(Number(e.target.value) || 0)}
            min="0"
            placeholder="Stake Mín (€)"
          />
        </div>

        <div className="filter-item compact">
          <input
            id="maxStake"
            type="number"
            value={maxStake}
            onChange={(e) => setMaxStake(e.target.value === "" ? "" : Number(e.target.value))}
            min="0"
            placeholder="Stake Máx (€)"
          />
        </div>

        <div className="filter-item compact period-select">
          <select id="timeRange" value={timeRange} onChange={(e) => setTimeRange(Number(e.target.value))}>
            <option value={15}>Período: 15 min</option>
            <option value={60}>Período: 1 hora</option>
            <option value={120}>Período: 2 horas</option>
            <option value={-1}>Período: Hoje</option>
            <option value={10080}>Período: Últimos 7 dias</option>
            <option value={43200}>Período: Último mês</option>
          </select>
        </div>

        <button type="button" className="btn-clear" onClick={clearFilters}>
          Limpar
        </button>

        <div className={`table-status ${status}`}>
          {status === "open" ? "● Ligado" : status === "connecting" ? "◌ A ligar" : "○ Desligado"}
        </div>
      </div>

      <div className="summary-bar">
        <span>Grupos: <strong>{summary.totalGroups.toLocaleString()}</strong></span>
        <span>Total apostas: <strong>{summary.totalBets.toLocaleString()}</strong></span>
        <span>Exposição total: <strong>€{summary.totalExposure.toFixed(0)}</strong></span>
      </div>

      <div className="grouped-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Desporto</th>
              <th>Evento</th>
              <th>Mercado</th>
              <th>Seleção</th>
              <th className="align-right">
                <SortButton label="Odds" field="odds" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
              </th>
              <th className="align-center">
                <SortButton label="Apostas" field="betCount" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
              </th>
              <th className="align-right">
                <SortButton label="Stake Total" field="totalStake" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
              </th>
              <th className="align-right">
                <SortButton label="Exposição" field="totalExposure" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
              </th>
              <th>
                <SortButton label="Última aposta" field="lastBetPlacedAt" sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />
              </th>
            </tr>
          </thead>

          <tbody>
            {groupedData.length === 0 ? (
              <tr>
                <td colSpan={9} className="empty-row">
                  {error ? `Não foi possível obter dados: ${error}` : "Sem apostas para os filtros escolhidos."}
                </td>
              </tr>
            ) : (
              groupedData.map((group, index) => (
                <tr key={`${group.event}-${group.market}-${group.selection}-${group.odds}-${index}`} className={getHighlightClass(group)}>
                  <td className="sport-cell">{group.sport}</td>
                  <td>{group.event}</td>
                  <td>{group.market}</td>
                  <td>{group.selection}</td>
                  <td className="align-right mono">{group.odds.toFixed(2)}</td>
                  <td className="align-center">
                    <BetAnalysisPopover group={group} timeRange={debouncedTimeRange} />
                  </td>
                  <td className="align-right mono">€{group.totalStake.toFixed(0)}</td>
                  <td className="align-right mono exposure">€{group.totalExposure.toFixed(0)}</td>
                  <td className="mono">{formatTimeAgo(group.lastBetPlacedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
