import "./BetTable.scss";

function BetTable({ bets, status, stats }) {
  return (
    <div>
      <div className="stats-bar">
        <span>
          Total apostas: <strong>{stats.total.toLocaleString()}</strong>
        </span>
        <span>
          Na tabela: <strong>{bets.length}</strong>
        </span>
        <span className={`status ${status}`}>
          {status === "open"
            ? "● Conectado"
            : status === "connecting"
              ? "◌ A conectar..."
              : "○ Desconectado"}
        </span>
      </div>

      <div className="bet-table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Sport</th>
              <th>Event</th>
              <th>Type</th>
              <th>Selection</th>
              <th>Odd</th>
              <th>Stake</th>
            </tr>
          </thead>
          <tbody>
            {bets.map((bet) => (
              <tr key={bet.id} data-bet-id={bet.id}>
                <td className="sport">{bet.sport}</td>
                <td>{bet.event}</td>
                <td>{bet.betType}</td>
                <td>{bet.selection}</td>
                <td className="odd">{bet.odd}</td>
                <td className="stake">€{bet.stake}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default BetTable;
