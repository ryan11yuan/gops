import type { PublicState, Seat } from '@/lib/types'
import { ClubPip } from '@/components/Marks'

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
  const tied = reveal.winner === 'TIE'
  const outcome = tied ? 'Tie — prize pushed' : youWon ? 'You win' : 'You lose'
  const secs = autoAdvanceAt ? Math.max(0, Math.ceil((autoAdvanceAt - now) / 1000)) : null
  const tone = tied ? '' : youWon ? ' is-win' : ' is-lose'

  return (
    <section className={`reveal${tone}`} aria-label="Round result">
      <div className="reveal-cards">
        <div className="reveal-slot">
          <span
            className={`pcard reveal-card${youSeat === 'P1' ? ' is-yours' : ''}`}
            data-testid="reveal-p1"
          >
            <ClubPip size={11} />
            {reveal.p1Card}
          </span>
          <span className="caption">{youSeat === 'P1' ? 'You' : 'Them'}</span>
        </div>
        <span className="reveal-vs">vs</span>
        <div className="reveal-slot">
          <span
            className={`pcard reveal-card is-second${youSeat === 'P2' ? ' is-yours' : ''}`}
            data-testid="reveal-p2"
          >
            <ClubPip size={11} />
            {reveal.p2Card}
          </span>
          <span className="caption">{youSeat === 'P2' ? 'You' : 'Them'}</span>
        </div>
      </div>
      <p className="reveal-outcome">
        {outcome}
        {reveal.awarded > 0 && <span className="delta">+{reveal.awarded}</span>}
      </p>
      <p className="reveal-next">{secs == null ? 'Next round…' : `Next round in ${secs}s`}</p>
    </section>
  )
}
