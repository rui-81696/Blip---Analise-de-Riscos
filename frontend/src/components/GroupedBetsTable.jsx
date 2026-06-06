import { useEffect, useMemo, useRef, useState } from "react"
import "./GroupedBetsTable.scss"
import { appendStoredBets, getRangeStartMs, loadStoredBets, normalizeBet } from "../utils/betsStore"
import BetAnalysisPopover from "./BetAnalysisPopover"

const REFRESH_THROTTLE_MS = 1000
const WS_RECONNECT_DELAY_MS = 1000
const FILTER_DEBOUNCE_MS = 300
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

function getSortValue(group, field) {
  if (field === "betCount") return group.betCount
  if (field === "totalStake") return group.totalStake
  if (field === "lastBetPlacedAt") return new Date(group.lastBetPlacedAt).getTime()
  if (field === "odds") return group.odds
  return group.totalExposure
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
  const [allBets, setAllBets] = useState(loadStoredBets)

  const debouncedSearchText = useDebouncedValue(searchText, FILTER_DEBOUNCE_MS)
  const debouncedSelectedSport = useDebouncedValue(selectedSport, FILTER_DEBOUNCE_MS)
  const debouncedMinOdds = useDebouncedValue(minOdds, FILTER_DEBOUNCE_MS)
  const debouncedMaxOdds = useDebouncedValue(maxOdds, FILTER_DEBOUNCE_MS)
  const debouncedMinBets = useDebouncedValue(minBets, FILTER_DEBOUNCE_MS)
  const debouncedMinStake = useDebouncedValue(minStake, FILTER_DEBOUNCE_MS)
  const debouncedMaxStake = useDebouncedValue(maxStake, FILTER_DEBOUNCE_MS)
  const debouncedTimeRange = useDebouncedValue(timeRange, FILTER_DEBOUNCE_MS)

  const seenIdsRef = useRef(new Set())
  const sportSetRef = useRef(new Set())
  const refreshTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  const { groupedData, summary } = useMemo(() => {
    const searchLower = debouncedSearchText.trim().toLowerCase()
    const rangeStartMs = getRangeStartMs(debouncedTimeRange)

    // Agrega as apostas individuais (mesma fonte que o popover) aplicando a
    // janela temporal sobre o timestamp de cada aposta.
    const groupedMap = new Map()

    for (const bet of allBets) {
      const betTsMs = new Date(bet.timestamp).getTime()
      if (!Number.isFinite(betTsMs) || betTsMs < rangeStartMs) continue
      if (debouncedSelectedSport !== "all" && bet.sport !== debouncedSelectedSport) continue
      if (debouncedMinOdds !== "" && bet.odd < debouncedMinOdds) continue
      if (debouncedMaxOdds !== "" && bet.odd > debouncedMaxOdds) continue

      if (searchLower) {
        const searchable = `${bet.event} ${bet.sport} ${bet.betType} ${bet.selection}`.toLowerCase()
        if (!searchable.includes(searchLower)) continue
      }

      const key = `${bet.sport}|${bet.event}|${bet.betType}|${bet.selection}|${bet.odd.toFixed(2)}`
      const existing = groupedMap.get(key)

      if (existing) {
        existing.betCount += 1
        existing.totalStake += bet.stake
        existing.totalExposure += bet.potentialProfit
        if (betTsMs > existing.lastBetTsMs) {
          existing.lastBetTsMs = betTsMs
          existing.lastBetPlacedAt = bet.timestamp
        }
      } else {
        groupedMap.set(key, {
          sport: bet.sport,
          event: bet.event,
          market: bet.betType,
          selection: bet.selection,
          odds: bet.odd,
          betCount: 1,
          totalStake: bet.stake,
          totalExposure: bet.potentialProfit,
          lastBetPlacedAt: bet.timestamp,
          lastBetTsMs: betTsMs,
        })
      }
    }

    // Filtros ao nível do grupo (stake total e número mínimo de apostas).
    const groups = Array.from(groupedMap.values()).filter((group) => {
      if (group.totalStake < debouncedMinStake) return false
      if (debouncedMaxStake !== "" && group.totalStake > debouncedMaxStake) return false
      return group.betCount >= debouncedMinBets
    })

    groups.sort((a, b) => {
      const left = getSortValue(a, sortField)
      const right = getSortValue(b, sortField)
      return sortOrder === "asc" ? left - right : right - left
    })

    return {
      groupedData: groups.slice(0, MAX_GROUP_ROWS),
      summary: {
        totalGroups: groups.length,
        totalBets: groups.reduce((acc, g) => acc + g.betCount, 0),
        totalExposure: groups.reduce((acc, g) => acc + g.totalExposure, 0),
      },
    }
  }, [
    allBets,
    debouncedMaxOdds,
    debouncedMaxStake,
    debouncedMinBets,
    debouncedMinOdds,
    debouncedMinStake,
    debouncedSearchText,
    debouncedSelectedSport,
    debouncedTimeRange,
    sortField,
    sortOrder,
  ])

  useEffect(() => {
    let ws = null
    let isUnmounting = false

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        return
      }

      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        setAllBets(loadStoredBets())
      }, REFRESH_THROTTLE_MS)
    }

    const ingestBets = (bets, { persist = true } = {}) => {
      if (!Array.isArray(bets) || bets.length === 0) return

      const acceptedBets = []

      for (const rawBet of bets) {
        const bet = normalizeBet(rawBet)

        if (bet.id === undefined || bet.id === null || seenIdsRef.current.has(bet.id)) continue
        if (Number.isNaN(new Date(bet.timestamp).getTime())) continue

        seenIdsRef.current.add(bet.id)
        if (bet.sport) sportSetRef.current.add(bet.sport)
        acceptedBets.push(bet)
      }

      if (persist && acceptedBets.length > 0) {
        appendStoredBets(acceptedBets)
      }

      setSports(["all", ...Array.from(sportSetRef.current).sort()])
      scheduleRefresh()
    }

    const hydrateFromStorage = () => {
      const storedBets = loadStoredBets()

      if (storedBets.length > 0) {
        ingestBets(storedBets, { persist: false })
      }
    }

    const connect = () => {
      if (isUnmounting) {
        return
      }

      setStatus("connecting")
      ws = new WebSocket(getWebSocketUrl())

      ws.onopen = () => {
        setStatus("open")
        scheduleRefresh()
      }

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload?.type === "initial" || payload?.type === "live") {
            ingestBets(payload.bets)
          }
        } catch {
          // ignora mensagens inválidas
        }
      }

      ws.onerror = () => {
        setStatus("closed")
      }

      ws.onclose = () => {
        if (isUnmounting) {
          return
        }

        setStatus("connecting")
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          connect()
        }, WS_RECONNECT_DELAY_MS)
      }
    }

    hydrateFromStorage()
    connect()

    // no-op: removed expected initial count indicator

    return () => {
      isUnmounting = true

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }

      if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.close()
      }
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
                <td colSpan={9} className="empty-row">Sem apostas para os filtros escolhidos.</td>
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