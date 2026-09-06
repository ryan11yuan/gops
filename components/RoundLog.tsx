import type { LogEntry, Seat } from '@/lib/types'

export function RoundLog({ log, youSeat }: { log: LogEntry[]; youSeat: Seat }) {
  return (
    <section className="round-log" aria-label="Round history">
      <h2>Round history</h2>
      {log.length === 0 ? (
        <p className="log-empty">Finished rounds land here, with both bids shown.</p>
      ) : (
        <div className="round-log-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Prize</th>
                <th scope="col">You</th>
                <th scope="col">Opp</th>
                <th scope="col">Result</th>
              </tr>
            </thead>
            <tbody>
              {log.map((e) => {
                const mine = youSeat === 'P1' ? e.p1Card : e.p2Card
                const theirs = youSeat === 'P1' ? e.p2Card : e.p1Card
                const tie = e.winner === 'TIE'
                const won = e.winner === youSeat
                const result = tie ? 'Tie' : won ? `You won +${e.awarded}` : 'You lost'
                const tone = tie ? 'is-tie' : won ? 'is-win' : 'is-lose'
                return (
                  <tr key={e.round}>
                    <td>{e.round}</td>
                    <td>
                      {e.prize}
                      {e.carryApplied ? ` (+${e.carryApplied})` : ''}
                    </td>
                    <td>{mine}</td>
                    <td>{theirs}</td>
                    <td>
                      <span className={`result-pill ${tone}`}>{result}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
