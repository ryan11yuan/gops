import type { Suit } from '@/lib/cards'
import { cardName } from '@/lib/cards'
import { PlayingCard } from '@/components/PlayingCard'

export function Hand({
  hand,
  suit,
  disabled,
  onPick,
}: {
  hand: number[]
  suit: Suit
  disabled: boolean
  onPick: (card: number) => void
}) {
  return (
    <section className="hand-block" aria-label="Your hand">
      <div className="hand-label">
        <h2 className="caption">Your hand</h2>
        <span className="caption">{hand.length} cards left</span>
      </div>
      <div className="hand">
        {hand.map((card) => (
          <button
            key={card}
            type="button"
            className="card-btn"
            aria-label={cardName(card, suit)}
            disabled={disabled}
            onClick={() => onPick(card)}
          >
            <PlayingCard rank={card} suit={suit} />
          </button>
        ))}
      </div>
    </section>
  )
}
