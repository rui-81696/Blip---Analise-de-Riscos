import './App.scss'
import { useBets } from './hooks/useBets'
import BetTable from './components/BetTable'

function App() {
  const { bets, status, stats } = useBets()

  return (
    <>
      <h1>Análise de Riscos — Apostas</h1>
      <BetTable bets={bets} status={status} stats={stats} />
    </>
  )
}

export default App
