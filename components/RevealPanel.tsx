import type { PublicState, Seat } from '@/lib/types'

export function RevealPanel({
  reveal,
  youSeat,
  autoAdvanceAt,
  now,
}: {
  reveal: NonNullable<PublicState['reveal']>
  youSeat: Seat
  autoAdvanceAt: number | null
  now: number
}) {
  const youWon = reveal.winner === youSeat
  const outcome =
    reveal.winner === 'TIE' ? 'Tie — prize pushed' : youWon ? 'You win' : 'You lose'
  const secs = autoAdvanceAt ? Math.max(0, Math.ceil((autoAdvanceAt - now) / 1000)) : null

  return (
    <section className="reveal" aria-label="Round result">
      <div className="reveal-cards">
        <span className="reveal-card" data-testid="reveal-p1">{reveal.p1Card}</span>
        <span className="reveal-vs">vs</span>
        <span className="reveal-card" data-testid="reveal-p2">{reveal.p2Card}</span>
      </div>
      <p className="reveal-outcome">{outcome}{reveal.awarded > 0 ? ` +${reveal.awarded}` : ''}</p>
      <p className="reveal-next">{secs == null ? 'Next round…' : `Next round in ${secs}s`}</p>
    </section>
  )
}
