/*
 * ===== BetsTable.jsx =====
 * COMPONENTE: Tabela Interativa de Apostas
 *
 * Este componente recebe um array de apostas como prop (dado do pai)
 * e renderiza-as numa tabela HTML com ordenação por coluna.
 *
 * CONCEITOS REACT IMPORTANTES:
 * - Props: dados que o componente pai (App.jsx) passa para este componente filho
 *   São recebidos como parâmetro da função: function BetsTable({ bets, sortBy, ... })
 * - .map(): método de arrays que transforma cada elemento num elemento JSX
 *   É assim que criamos listas dinâmicas em React
 * - Renderização condicional: mostrar conteúdo diferente baseado em condições
 *   (ex: se loading=true, mostra spinner; se bets está vazio, mostra mensagem)
 *
 * METODOLOGIA BEM (Block Element Modifier):
 * As classes CSS seguem o padrão BEM: bloco__elemento--modificador
 * Ex: bets-table__th--sortable = elemento "th" do bloco "bets-table" com modificador "sortable"
 */

// Importar funções de formatação do nosso ficheiro de utilitários
import { formatCurrency, formatDate, getRiskLevel, getRiskLabel, translateStatus, translateSport } from '../../utils/formatters';

// Importar os estilos específicos deste componente
import './BetsTable.scss';

/**
 * Componente BetsTable
 *
 * Props recebidas do componente pai (App.jsx):
 * @param {Array} bets - Array de objetos com os dados das apostas
 * @param {string} sortBy - Nome da coluna atualmente ordenada
 * @param {string} sortOrder - 'asc' (ascendente) ou 'desc' (descendente)
 * @param {function} onSort - Função callback chamada quando o user clica numa coluna
 * @param {boolean} loading - Se os dados estão a ser carregados
 *
 * "export default" significa que este é o export principal deste ficheiro
 */
export default function BetsTable({ bets, sortBy, sortOrder, onSort, loading }) {
  /*
   * Definição das colunas da tabela.
   * Cada coluna tem:
   * - key: nome do campo no objeto de aposta (ex: bet.sport)
   * - label: texto que aparece no cabeçalho da tabela
   * - sortable: se o utilizador pode clicar para ordenar por esta coluna
   */
  const columns = [
    { key: 'id', label: 'ID', sortable: false },         // ID não é ordenável
    { key: 'userId', label: 'Utilizador', sortable: true },
    { key: 'sport', label: 'Desporto', sortable: true },
    { key: 'event', label: 'Evento', sortable: true },
    { key: 'amount', label: 'Valor (€)', sortable: true },
    { key: 'odds', label: 'Odds', sortable: true },
    { key: 'status', label: 'Estado', sortable: true },
    { key: 'riskScore', label: 'Risco', sortable: true },
    { key: 'createdAt', label: 'Data', sortable: true },
  ];

  /**
   * Devolve o ícone de ordenação para uma coluna
   * Se a coluna não está ativa: mostra ↕ (pode ser ordenada em ambas direções)
   * Se está ativa: mostra ↑ (ascendente) ou ↓ (descendente)
   */
  const getSortIcon = (key) => {
    if (sortBy !== key) return '↕';                         // Coluna não ativa
    return sortOrder === 'asc' ? '↑' : '↓';                // Coluna ativa
  };

  /*
   * ─── RENDERIZAÇÃO CONDICIONAL ───
   * Antes de mostrar a tabela, verificamos estados especiais:
   */

  // Se está a carregar, mostra um spinner de loading
  if (loading) {
    return (
      <div className="bets-table__loading">
        <div className="loading-spinner">
          <div className="loading-spinner__circle" />
        </div>
        <p>A carregar apostas...</p>
      </div>
    );
  }

  // Se não há apostas, mostra uma mensagem informativa
  if (!bets || bets.length === 0) {
    return (
      <div className="bets-table__empty">
        <p>Nenhuma aposta encontrada.</p>
        <p className="text-muted">Ajuste os filtros ou aguarde novos dados.</p>
      </div>
    );
  }

  /*
   * ─── RENDERIZAÇÃO PRINCIPAL DA TABELA ───
   * Se chegámos aqui, temos dados para mostrar!
   */
  return (
    <div className="bets-table">
      {/* Wrapper com scroll horizontal para tabelas largas */}
      <div className="bets-table__wrapper">
        <table className="bets-table__table">

          {/* ─── CABEÇALHO DA TABELA ─── */}
          <thead>
            <tr>
              {/*
               * .map() percorre o array de colunas e cria um <th> para cada uma.
               * A "key" é obrigatória em listas do React para identificar cada elemento.
               *
               * Template literals (backticks ``) permitem juntar strings com variáveis:
               * `bets-table__th ${condição ? 'classe1' : 'classe2'}`
               * O operador ternário (condição ? sim : não) escolhe entre duas opções.
               */}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`bets-table__th ${col.sortable ? 'bets-table__th--sortable' : ''} ${
                    sortBy === col.key ? 'bets-table__th--active' : ''
                  }`}
                  // onClick: quando o user clica, chama onSort (que veio do App.jsx)
                  // Mas SÓ se a coluna for ordenável (col.sortable && ...)
                  onClick={() => col.sortable && onSort(col.key)}
                >
                  <span>{col.label}</span>
                  {/* Mostrar ícone de ordenação apenas para colunas ordenáveis */}
                  {col.sortable && (
                    <span className="bets-table__sort-icon">{getSortIcon(col.key)}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          {/* ─── CORPO DA TABELA (dados) ─── */}
          <tbody>
            {/*
             * .map() percorre cada aposta e cria uma linha (<tr>) para cada uma.
             * Dentro de cada linha, criamos uma célula (<td>) para cada campo.
             *
             * { getRiskLevel, getRiskLabel, translateStatus, etc. } são funções
             * importadas de formatters.js que transformam os dados em texto legível.
             */}
            {bets.map((bet) => {
              // Calcular o nível de risco para aplicar a classe CSS correta
              const riskLevel = getRiskLevel(bet.riskScore);
              return (
                <tr key={bet.id} className="bets-table__row">
                  {/* ID - só mostra os primeiros 8 caracteres (é um UUID longo) */}
                  <td className="bets-table__td bets-table__td--id">
                    <span title={bet.id}>{bet.id.slice(0, 8)}...</span>
                  </td>
                  {/* Utilizador */}
                  <td className="bets-table__td">{bet.userId}</td>
                  {/* Desporto - traduzido para português */}
                  <td className="bets-table__td">{translateSport(bet.sport)}</td>
                  {/* Evento */}
                  <td className="bets-table__td bets-table__td--event">{bet.event}</td>
                  {/* Valor - formatado como moeda EUR */}
                  <td className="bets-table__td bets-table__td--amount">
                    {formatCurrency(bet.amount)}
                  </td>
                  {/* Odds - com 2 casas decimais */}
                  <td className="bets-table__td">{bet.odds.toFixed(2)}</td>
                  {/* Estado - com badge colorido */}
                  <td className="bets-table__td">
                    <span className={`status-badge status-badge--${bet.status}`}>
                      {translateStatus(bet.status)}
                    </span>
                  </td>
                  {/* Risco - com badge colorido por nível */}
                  <td className="bets-table__td">
                    <span className={`risk-badge risk-badge--${riskLevel}`}>
                      {bet.riskScore} — {getRiskLabel(bet.riskScore)}
                    </span>
                  </td>
                  {/* Data - formatada em formato PT */}
                  <td className="bets-table__td bets-table__td--date">
                    {formatDate(bet.createdAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
