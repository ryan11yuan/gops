import Link from 'next/link'
import type { PublicState } from '@/lib/types'
import { RoundLog } from '@/components/RoundLog'
import { ArrowLeftIcon, CharacterMark, RefreshIcon, Sparkle, Squiggle } from '@/components/Marks'

export function EndScreen({ state, onRematch }: { state: PublicState; onRematch: () => void }) {
  const fr = state.finalResult!
  const draw = fr.winner === 'DRAW'
  const won = fr.winner === state.you.seat
  const youScore = state.you.seat === 'P1' ? fr.p1 : fr.p2
  const oppScore = state.you.seat === 'P1' ? fr.p2 : fr.p1
  const margin = Math.abs(youScore - oppScore)

  // The verdict stays a single text run so it reads (and is announced) whole;
  // the pill device lands on the margin line beneath it.
  const verdict = draw ? 'Dead even.' : won ? 'You win.' : 'You lose.'
  const points = `${margin} point${margin === 1 ? '' : 's'}`

  return (
    <main className="endscreen">
      <div className="end-head">
        <div className="mark-row">
          {draw ? (
            <>
              <CharacterMark seed={3} />
              <Squiggle />
              <CharacterMark seed={3} />
            </>
          ) : won ? (
            <>
              <CharacterMark seed={0} />
              <Sparkle />
            </>
          ) : (
            <>
              <CharacterMark seed={4} />
              <Squiggle />
            </>
          )}
        </div>
        <h1 className="display-sm">{verdict}</h1>
        {draw ? (
          <p className="lede">Thirteen prizes, split straight down the middle.</p>
        ) : (
          <p className="end-margin">
            {won ? 'Taken by' : 'Dropped by'}{' '}
            <span className={`pill-word ${won ? 'is-marigold' : 'is-coral'}`}>{points}</span>
          </p>
        )}
      </div>

      <section className="dark-panel final-panel" aria-label="Final score">
        <div className="final-side">
          <span className="final-name">{state.you.name}</span>
          <span className="final-value">{youScore}</span>
        </div>
        <span className="final-dash" aria-hidden="true">
          —
        </span>
        <div className="final-side them">
          <span className="final-name">{state.opponent?.name ?? 'Opponent'}</span>
          <span className="final-value">{oppScore}</span>
        </div>
      </section>

      <div className="end-actions">
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={onRematch}
          disabled={state.youWantRematch}
        >
          <RefreshIcon />
          {state.youWantRematch ? 'Rematch requested' : 'Rematch'}
        </button>
        <Link href="/" className="btn btn-text">
          <ArrowLeftIcon />
          Leave
        </Link>
      </div>

      {state.youWantRematch && !state.opponentWantsRematch && (
        <p className="waiting" role="status">
          <span className="waiting-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Waiting for your opponent to accept
        </p>
      )}

      <RoundLog log={state.log} youSeat={state.you.seat} />
    </main>
  )
}
