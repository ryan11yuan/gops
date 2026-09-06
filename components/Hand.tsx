import { ClubPip } from '@/components/Marks'

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
            disabled={disabled}
            onClick={() => onPick(card)}
          >
            <ClubPip size={11} />
            {card}
          </button>
        ))}
      </div>
    </section>
  )
}
