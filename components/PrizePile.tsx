export function PrizePile({
  prizeCard,
  prizesRemaining,
  carry,
}: {
  prizeCard: number | null
  prizesRemaining: number
  carry: number
}) {
  return (
    <section className="prize-pile" aria-label="Prize">
      <div className="prize-deck" aria-hidden />
      <div className="prize-card" data-testid="prize-card">{prizeCard ?? '—'}</div>
      {carry > 0 && <div className="carry-badge">+{carry} carried</div>}
      <p className="prize-remaining">{prizesRemaining} left</p>
    </section>
  )
}
