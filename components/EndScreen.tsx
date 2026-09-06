import type { PublicState } from '@/lib/types'
import { RoundLog } from '@/components/RoundLog'

export function EndScreen({ state, onRematch }: { state: PublicState; onRematch: () => void }) {
  const fr = state.finalResult!
  const headline =
    fr.winner === 'DRAW' ? 'Draw' : fr.winner === state.you.seat ? 'You win!' : 'You lose'
  const youScore = state.you.seat === 'P1' ? fr.p1 : fr.p2
  const oppScore = state.you.seat === 'P1' ? fr.p2 : fr.p1

  return (
    <main className="endscreen">
      <h1>{headline}</h1>
      <p className="final-score">
        {state.you.name} {youScore} — {oppScore} {state.opponent?.name ?? 'Opponent'}
      </p>
      <button onClick={onRematch} disabled={state.youWantRematch}>Rematch</button>
      {state.youWantRematch && !state.opponentWantsRematch && (
        <p role="status">Waiting for opponent to accept…</p>
      )}
      <RoundLog log={state.log} youSeat={state.you.seat} />
      <a href="/">Leave</a>
    </main>
  )
}
