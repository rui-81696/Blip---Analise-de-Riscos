import { useState } from 'react'
import './App.scss'
import GroupedBetsTable from './components/GroupedBetsTable'
import AssistantChat from './components/AssistantChat'

function App() {
  // Estado das Regras de Highlight — partilhado entre a tabela (aplica o
  // destaque + painel) e o assistente (gere-as por linguagem natural).
  const [highlightRules, setHighlightRules] = useState([])

  return (
    <>
      <GroupedBetsTable highlightRules={highlightRules} onRulesChange={setHighlightRules} />
      <AssistantChat highlightRules={highlightRules} onRulesChange={setHighlightRules} />
    </>
  )
}

export default App
