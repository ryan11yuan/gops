import type { LogEntry, Seat } from '@/lib/types'

export function RoundLog({ log, youSeat }: { log: LogEntry[]; youSeat: Seat }) {
  return (
    <section className="round-log" aria-label="Round history">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Prize</th>
            <th>You</th>
            <th>Opp</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {log.map((e) => {
            const mine = youSeat === 'P1' ? e.p1Card : e.p2Card
            const theirs = youSeat === 'P1' ? e.p2Card : e.p1Card
            const result =
              e.winner === 'TIE' ? 'Tie' : e.winner === youSeat ? `You won +${e.awarded}` : `You lost`
            return (
              <tr key={e.round}>
                <td>{e.round}</td>
                <td>{e.prize}{e.carryApplied ? ` (+${e.carryApplied})` : ''}</td>
                <td>{mine}</td>
                <td>{theirs}</td>
                <td>{result}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
