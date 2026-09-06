import { DiamondPip } from '@/components/Marks'

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
      <div className="prize-deck" aria-hidden />
      <div className="pcard prize-card" data-testid="prize-card" key={prizeCard ?? 'none'}>
        <DiamondPip />
        {prizeCard ?? '—'}
        <DiamondPip />
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
