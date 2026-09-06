import type { PublicState } from '@/lib/types'

export function Scoreboard({
  you,
  opponent,
  round,
}: {
  you: PublicState['you']
  opponent: PublicState['opponent']
  round: number
}) {
  return (
    <section className="scoreboard" aria-label="Score">
      <div className="score you">
        <span className="score-name">{you.name}</span>
        <span className="score-value">{you.score}</span>
      </div>
      <div className="round-counter">Round {round} / 13</div>
      <div className="score opp">
        <span className="score-name">{opponent?.name ?? 'Waiting…'}</span>
        <span className="score-value">{opponent?.score ?? 0}</span>
      </div>
    </section>
  )
}
