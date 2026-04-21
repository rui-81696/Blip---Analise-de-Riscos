import { useEffect, useMemo, useRef, useState } from "react"
import "./GroupedBetsTable.scss"

const REFRESH_THROTTLE_MS = 1000
const WS_RECONNECT_DELAY_MS = 1000
const FILTER_DEBOUNCE_MS = 300
const MAX_GROUP_ROWS = 500
const ONE_MINUTE_MS = 60 * 1000

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

function getMinuteKey(timestamp) {
  return Math.floor(new Date(timestamp).getTime() / ONE_MINUTE_MS)
}

function getTodayStartMinuteKey() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  return Math.floor(todayStart.getTime() / ONE_MINUTE_MS)
}

function createGroupAccumulatorFromBet(bet) {
  return {
    sport: bet.sport,
    event: bet.event,
    market: bet.betType,
    selection: bet.selection,
    odds: bet.odd,
    betCount: 1,
    totalStake: bet.stake,
    totalExposure: bet.potentialProfit,
    lastBetPlacedAt: bet.timestamp,
    lastBetTsMs: new Date(bet.timestamp).getTime(),
  }
}

function mergeGroupAccumulator(target, source) {
  target.betCount += source.betCount
  target.totalStake += source.totalStake
  target.totalExposure += source.totalExposure

  if (source.lastBetTsMs > target.lastBetTsMs) {
    target.lastBetTsMs = source.lastBetTsMs
    target.lastBetPlacedAt = source.lastBetPlacedAt
  }
}

function getWebSocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws"
  return `${protocol}://${window.location.host}/ws`
}

function normalizeBet(rawBet) {
  return {
    id: rawBet.id,
    sport: rawBet.sport,
    event: rawBet.event,
    betType: rawBet.betType || rawBet.bet_type,
    selection: rawBet.selection,
    odd: Number(rawBet.odd),
    stake: Number(rawBet.stake),
    riskScore: Number(rawBet.riskScore ?? rawBet.risk_score ?? 0),
    exposureRisk: Number(rawBet.exposureRisk ?? rawBet.exposure_risk ?? 0),
    timestamp: rawBet.timestamp,
    potentialPayout: Number(rawBet.potentialPayout ?? rawBet.potential_payout ?? 0),
    potentialProfit: Number(rawBet.potentialProfit ?? rawBet.potential_profit ?? 0),
  }
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
  const [dataVersion, setDataVersion] = useState(0)

  const debouncedSearchText = useDebouncedValue(searchText, FILTER_DEBOUNCE_MS)
  const debouncedSelectedSport = useDebouncedValue(selectedSport, FILTER_DEBOUNCE_MS)
  const debouncedMinOdds = useDebouncedValue(minOdds, FILTER_DEBOUNCE_MS)
  const debouncedMaxOdds = useDebouncedValue(maxOdds, FILTER_DEBOUNCE_MS)
  const debouncedMinBets = useDebouncedValue(minBets, FILTER_DEBOUNCE_MS)
  const debouncedMinStake = useDebouncedValue(minStake, FILTER_DEBOUNCE_MS)
  const debouncedMaxStake = useDebouncedValue(maxStake, FILTER_DEBOUNCE_MS)
  const debouncedTimeRange = useDebouncedValue(timeRange, FILTER_DEBOUNCE_MS)

  const minuteBucketsRef = useRef(new Map())
  const seenIdsRef = useRef(new Set())
  const sportSetRef = useRef(new Set())
  const refreshTimerRef = useRef(null)
  const reconnectTimerRef = useRef(null)

  const { groupedData, summary } = useMemo(() => {
    const searchLower = debouncedSearchText.trim().toLowerCase()
    const nowMinuteKey = Math.floor(Date.now() / ONE_MINUTE_MS)

    const minMinuteKey = debouncedTimeRange === -1 ? getTodayStartMinuteKey() : nowMinuteKey - Number(debouncedTimeRange)

    const groupedMap = new Map()

    minuteBucketsRef.current.forEach((minuteGroups, minuteKey) => {
      if (minuteKey < minMinuteKey) return

      minuteGroups.forEach((sourceGroup, key) => {
        if (debouncedSelectedSport !== "all" && sourceGroup.sport !== debouncedSelectedSport) return
        if (debouncedMinOdds !== "" && sourceGroup.odds < debouncedMinOdds) return
        if (debouncedMaxOdds !== "" && sourceGroup.odds > debouncedMaxOdds) return
        if (sourceGroup.totalStake < debouncedMinStake) return
        if (debouncedMaxStake !== "" && sourceGroup.totalStake > debouncedMaxStake) return

        if (searchLower) {
          const searchable = `${sourceGroup.event} ${sourceGroup.sport} ${sourceGroup.market} ${sourceGroup.selection}`.toLowerCase()
          if (!searchable.includes(searchLower)) return
        }

        const existing = groupedMap.get(key)
        if (existing) {
          mergeGroupAccumulator(existing, sourceGroup)
        } else {
          groupedMap.set(key, { ...sourceGroup })
        }
      })
    })

    const groups = Array.from(groupedMap.values()).filter((group) => group.betCount >= debouncedMinBets)

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
    dataVersion,
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
        setDataVersion((version) => version + 1)
      }, REFRESH_THROTTLE_MS)
    }

    const ingestBets = (bets) => {
      if (!Array.isArray(bets) || bets.length === 0) return

      for (const rawBet of bets) {
        const bet = normalizeBet(rawBet)

        if (bet.id === undefined || bet.id === null || seenIdsRef.current.has(bet.id)) continue

        const minuteKey = getMinuteKey(bet.timestamp)
        if (Number.isNaN(minuteKey)) continue

        if (minuteBucketsRef.current.size > 1440) {
          const oldestKey = Math.min(...minuteBucketsRef.current.keys())
          minuteBucketsRef.current.delete(oldestKey)
        }

        let minuteGroups = minuteBucketsRef.current.get(minuteKey)
        if (!minuteGroups) {
          minuteGroups = new Map()
          minuteBucketsRef.current.set(minuteKey, minuteGroups)
        }

        const groupKey = `${bet.sport}|${bet.event}|${bet.betType}|${bet.selection}|${bet.odd.toFixed(2)}`
        const existing = minuteGroups.get(groupKey)

        if (existing) {
          existing.betCount += 1
          existing.totalStake += bet.stake
          existing.totalExposure += bet.potentialProfit
          const betTsMs = new Date(bet.timestamp).getTime()
          if (betTsMs > existing.lastBetTsMs) {
            existing.lastBetTsMs = betTsMs
            existing.lastBetPlacedAt = bet.timestamp
          }
        } else {
          minuteGroups.set(groupKey, createGroupAccumulatorFromBet(bet))
        }

        seenIdsRef.current.add(bet.id)
        if (bet.sport) sportSetRef.current.add(bet.sport)
      }

      setSports(["all", ...Array.from(sportSetRef.current).sort()])
      scheduleRefresh()
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

    connect()

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
                  <td className="align-center mono">{group.betCount}</td>
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