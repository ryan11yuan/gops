import { PRIZE_SUIT } from '@/lib/cards'
import { PlayingCard } from '@/components/PlayingCard'

export function PrizePile({
  prizeCard,
  prizesRemaining,
  carry,
}: {
  prizeCard: number | null
  prizesRemaining: number
  carry: number
}) {
  const pot = (prizeCard ?? 0) + carry

  return (
    <section className="prize-pile" aria-label="Prize">
      <div className="prize-stack">
        {prizesRemaining > 1 && <span className="pcard card-back is-back-2" aria-hidden />}
        {prizesRemaining > 0 && <span className="pcard card-back is-back-1" aria-hidden />}
        {prizeCard == null ? (
          <span className="pcard prize-card is-empty" data-testid="prize-card" aria-hidden>
            &mdash;
          </span>
        ) : (
          <PlayingCard
            key={prizeCard}
            rank={prizeCard}
            suit={PRIZE_SUIT}
            className="prize-card"
            testId="prize-card"
          />
        )}
      </div>
      <div className="prize-meta">
        <p className="prize-label">On the table</p>
        <p className="prize-worth numeric">
          {prizeCard == null ? 'Waiting for the next prize' : `Worth ${pot} point${pot === 1 ? '' : 's'}`}
        </p>
        {carry > 0 && <div className="carry-badge numeric">+{carry} carried over</div>}
        <p className="prize-remaining">{prizesRemaining} left in the prize deck</p>
      </div>
    </section>
  )
}
