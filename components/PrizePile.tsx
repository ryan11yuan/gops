import { PRIZE_SUIT } from '@/lib/cards'
import { PlayingCard } from '@/components/PlayingCard'

export function PrizePile({
  prizeCard,
  prizesRemaining,
  carry,
  carried = [],
}: {
  prizeCard: number | null
  prizesRemaining: number
  carry: number
  /** Tied prizes still on the table, oldest-first. Fanned face-up under the prize. */
  carried?: number[]
}) {
  const pot = (prizeCard ?? 0) + carry

  return (
    <section className="prize-pile" aria-label="Prize">
      <div
        className="prize-stack"
        data-testid="prize-stack"
        style={{ '--carried': carried.length } as React.CSSProperties}
      >
        {prizesRemaining > 1 && <span className="pcard card-back is-back-2" aria-hidden />}
        {prizesRemaining > 0 && <span className="pcard card-back is-back-1" aria-hidden />}
        {carried.map((card, i) => (
          <PlayingCard
            key={`${card}-${i}`}
            rank={card}
            suit={PRIZE_SUIT}
            className="prize-carried"
            testId="carried-card"
            style={{ '--i': carried.length - i } as React.CSSProperties}
          />
        ))}
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
