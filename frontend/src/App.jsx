import './App.scss'
import { useBets } from './hooks/useBets'
import BetTable from './components/BetTable'
import { useState, useMemo } from 'react'

function App() {
  const { bets, status, stats } = useBets()
  
  // Estados para os filtros
  const [selectedSport, setSelectedSport] = useState("Todos")
  const [oddMin, setOddMin] = useState("")
  const [oddMax, setOddMax] = useState("")
  const [stakeMin, setStakeMin] = useState("")
  const [stakeMax, setStakeMax] = useState("")

  // 🟠 NOVO: Função para limpar todos os filtros
  const handleClearFilters = () => {
    setSelectedSport("Todos")
    setOddMin("")
    setOddMax("")
    setStakeMin("")
    setStakeMax("")
  }

  // Filtrar os bets com TODOS os critérios
  const filteredBets = useMemo(() => {
    return bets.filter(bet => {
      // Filtro de desporto
      const sportMatch = selectedSport === "Todos" || bet.sport === selectedSport
      
      // Filtro de odd mínima
      const oddMinNum = oddMin === "" ? 0 : parseFloat(oddMin)
      const oddMinMatch = bet.odd >= oddMinNum
      
      // Filtro de odd máxima
      const oddMaxNum = oddMax === "" ? Infinity : parseFloat(oddMax)
      const oddMaxMatch = bet.odd <= oddMaxNum
      
      // Filtro de stake mínimo
      const stakeMinNum = stakeMin === "" ? 0 : parseFloat(stakeMin)
      const stakeMinMatch = bet.stake >= stakeMinNum
      
      // Filtro de stake máximo
      const stakeMaxNum = stakeMax === "" ? Infinity : parseFloat(stakeMax)
      const stakeMaxMatch = bet.stake <= stakeMaxNum
      
      // Retorna true se TODOS os filtros combinam
      return sportMatch && oddMinMatch && oddMaxMatch && stakeMinMatch && stakeMaxMatch
    })
  }, [bets, selectedSport, oddMin, oddMax, stakeMin, stakeMax])

  // Lista de desportos únicos
  const sports = useMemo(() => {
    const sportSet = new Set(bets.map(bet => bet.sport))
    return ["Todos", ...Array.from(sportSet).sort()]
  }, [bets])

  return (
    <>
      <h1>Análise de Riscos — Apostas</h1>
      
      {/* Filtros acima da tabela */}
      <div className="filters-container">
        <div className="filter-group">
          <label htmlFor="sport-filter">Desporto:</label>
          <select 
            id="sport-filter"
            value={selectedSport}
            onChange={(e) => setSelectedSport(e.target.value)}
          >
            {sports.map(sport => (
              <option key={sport} value={sport}>
                {sport}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="odd-min">Odd Mín:</label>
          <input 
            id="odd-min"
            type="number"
            placeholder="1.0"
            value={oddMin}
            onChange={(e) => setOddMin(e.target.value)}
            step="0.01"
            min="0"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="odd-max">Odd Máx:</label>
          <input 
            id="odd-max"
            type="number"
            placeholder="10.0"
            value={oddMax}
            onChange={(e) => setOddMax(e.target.value)}
            step="0.01"
            min="0"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="stake-min">Stake Mín (€):</label>
          <input 
            id="stake-min"
            type="number"
            placeholder="0"
            value={stakeMin}
            onChange={(e) => setStakeMin(e.target.value)}
            step="0.01"
            min="0"
          />
        </div>

        <div className="filter-group">
          <label htmlFor="stake-max">Stake Máx (€):</label>
          <input 
            id="stake-max"
            type="number"
            placeholder="10000"
            value={stakeMax}
            onChange={(e) => setStakeMax(e.target.value)}
            step="0.01"
            min="0"
          />
        </div>

        {/* 🟠 NOVO: Botão para limpar filtros */}
        <button 
          className="btn-clear"
          onClick={handleClearFilters}
        >
          Limpar Filtros
        </button>
      </div>

      <BetTable bets={filteredBets} status={status} stats={stats} />
    </>
  )
}

export default App