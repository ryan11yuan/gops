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
    <section className="hand" aria-label="Your hand">
      {hand.map((card) => (
        <button
          key={card}
          className="card-btn"
          disabled={disabled}
          onClick={() => onPick(card)}
        >
          {card}
        </button>
      ))}
    </section>
  )
}
