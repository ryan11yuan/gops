import { ClubPip } from '@/components/Marks'
import { rankLabel, rankName } from '@/lib/cards'

export function Hand({
  hand,
  disabled,
  onPick,
}: {
  hand: number[]
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
            aria-label={rankName(card)}
            disabled={disabled}
            onClick={() => onPick(card)}
          >
            <ClubPip size={11} />
            {rankLabel(card)}
          </button>
        ))}
      </div>
    </section>
  )
}
