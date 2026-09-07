import type { Suit } from '@/lib/cards'
import { cardName, isRedSuit, rankLabel } from '@/lib/cards'

/**
 * A standard playing-card face.
 *
 * Corner index top-left and, rotated, bottom-right; the canonical pip layout
 * for 2-10 with the lower half inverted; one oversized pip for the ace; a
 * drawn court panel for J/Q/K, mirrored across the middle the way a real court
 * card is. Every measurement scales off the `--card-w` custom property, so a
 * size variant sets one value and the whole face follows.
 */

const SUIT_PATHS: Record<Suit, string> = {
  spades:
    'M8 1.3C8 1.3 2.1 5.7 2.1 9.2a2.9 2.9 0 0 0 5.2 1.9c-.1 1.9-.6 3.2-1.6 4.2h4.6c-1-1-1.5-2.3-1.6-4.2a2.9 2.9 0 0 0 5.2-1.9C13.9 5.7 8 1.3 8 1.3Z',
  hearts:
    'M8 14.9C4.1 11.8 1.3 9.5 1.3 6.4a3.6 3.6 0 0 1 6.7-1.9 3.6 3.6 0 0 1 6.7 1.9c0 3.1-2.8 5.4-6.7 8.5Z',
  diamonds: 'M8 1.2 13.4 8 8 14.8 2.6 8 8 1.2Z',
  clubs:
    'M8 1.4a3 3 0 0 1 2.2 5.03 3 3 0 1 1 1.1 5.44A3.1 3.1 0 0 1 9 10.5c.05 1.9.6 3.15 1.5 4.1h-5c.9-.95 1.45-2.2 1.5-4.1a3.1 3.1 0 0 1-2.3 1.37A3 3 0 1 1 5.8 6.43 3 3 0 0 1 8 1.4Z',
}

function SuitGlyph({
  suit,
  className,
  style,
}: {
  suit: Suit
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <svg
      className={className ? `suit ${className}` : 'suit'}
      style={style}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
    >
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  )
}

/* --- Pip layouts ---------------------------------------------------------
   Coordinates are percentages of the pip field: x 0 / 50 / 100 are the three
   columns, y runs top to bottom. Anything below the middle is rotated, which
   is what makes a real card readable from either end. */

const T = 100 / 3
const PIPS: Record<number, [number, number][]> = {
  2: [[50, 0], [50, 100]],
  3: [[50, 0], [50, 50], [50, 100]],
  4: [[0, 0], [100, 0], [0, 100], [100, 100]],
  5: [[0, 0], [100, 0], [50, 50], [0, 100], [100, 100]],
  6: [[0, 0], [100, 0], [0, 50], [100, 50], [0, 100], [100, 100]],
  7: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [0, 100], [100, 100]],
  8: [[0, 0], [100, 0], [50, 25], [0, 50], [100, 50], [50, 75], [0, 100], [100, 100]],
  9: [[0, 0], [100, 0], [0, T], [100, T], [50, 50], [0, 100 - T], [100, 100 - T], [0, 100], [100, 100]],
  10: [
    [0, 0], [100, 0], [50, 100 / 6], [0, T], [100, T],
    [0, 100 - T], [100, 100 - T], [50, 500 / 6], [0, 100], [100, 100],
  ],
}

/* --- Court figures -------------------------------------------------------
   One half-figure per court rank, drawn in the same flat face language as the
   character marks elsewhere in the app, then rotated for the lower half. */

const CROWNS: Record<number, React.ReactElement> = {
  11: (
    <>
      <path className="court-crown court-line" d="M20 19.5c-1.5-8 4-13.5 13-13.5s14.5 5.5 13 13.5Z" />
      <rect className="court-crown court-line" x="17" y="16.6" width="32" height="4.6" rx="2.3" />
      <path className="court-line court-stroke" d="M49 16.5c5-2.5 6.5-8 4.5-12" />
    </>
  ),
  12: (
    <>
      <path
        className="court-crown court-line"
        d="M16 19.5c-1-6 0-10.5 2-12.5 2 3 5 3.5 6.5 1.5 1.2 3.4 4.3 5.2 8.5 5.2s7.3-1.8 8.5-5.2c1.5 2 4.5 1.5 6.5-1.5 2 2 3 6.5 2 12.5Z"
      />
      <circle className="court-crown court-line" cx="18" cy="6" r="2.1" />
      <circle className="court-crown court-line" cx="33" cy="4.2" r="2.3" />
      <circle className="court-crown court-line" cx="48" cy="6" r="2.1" />
    </>
  ),
  13: (
    <>
      <path className="court-crown court-line" d="M16 19.5 15.5 5l7.5 6.5L33 3l10 8.5L50.5 5 50 19.5Z" />
      <circle className="court-crown court-line" cx="33" cy="2.6" r="2.2" />
    </>
  ),
}

const ACCESSORIES: Record<number, React.ReactElement> = {
  11: (
    <>
      <path className="court-line court-stroke" d="M11 60V45.5" />
      <path className="court-crown court-line" d="M11 51c-4.2 0-6.4-2.2-6.4-5.4 3.2 0 6.4 2.2 6.4 5.4Z" />
      <path className="court-crown court-line" d="M11 45c4.2 0 6.4-2.2 6.4-5.4-3.2 0-6.4 2.2-6.4 5.4Z" />
    </>
  ),
  12: (
    <>
      <path className="court-line court-stroke" d="M11 60V46" />
      <circle className="court-crown court-line" cx="6.6" cy="40.6" r="3" />
      <circle className="court-crown court-line" cx="15.4" cy="40.6" r="3" />
      <circle className="court-crown court-line" cx="11" cy="36.6" r="3" />
      <circle className="court-crown court-line" cx="8.2" cy="45.4" r="3" />
      <circle className="court-crown court-line" cx="13.8" cy="45.4" r="3" />
      <circle className="court-skin court-line" cx="11" cy="41.4" r="2.4" />
    </>
  ),
  13: (
    <>
      <path className="court-line court-blade" d="M11 60V44" />
      <path className="court-line court-stroke" d="M6.4 47.6h9.2" />
      <circle className="court-crown court-line" cx="11" cy="41.6" r="2.8" />
    </>
  ),
}

function CourtFigure({ rank, suit }: { rank: number; suit: Suit }) {
  return (
    <svg viewBox="0 0 66 60" aria-hidden="true" focusable="false">
      {/* Robe first, so the chin sits on top of the collar. */}
      <path
        className="court-robe court-line"
        d="M33 36c-7.5 0-13 4-14.5 11L15 60h36l-3.5-13c-1.5-7-7-11-14.5-11Z"
      />
      <path className="court-line court-stroke" d="M33 40.5V60" />
      {/* The suit worn on the chest — the 16-unit glyph scaled into place. */}
      <path className="court-emblem" d={SUIT_PATHS[suit]} transform="translate(27.4 44) scale(0.7)" />
      <path
        className="court-skin court-line"
        d="M33 35.4c-4.1 0-7.7 1.6-9.8 4.1 2.6 2.6 6.1 4.1 9.8 4.1s7.2-1.5 9.8-4.1c-2.1-2.5-5.7-4.1-9.8-4.1Z"
      />
      <circle className="court-skin court-line" cx="33" cy="27" r="9.5" />
      {rank === 13 && (
        <path className="court-line court-stroke" d="M24.5 28.5c1.4 7.6 4.5 11.2 8.5 11.2s7.1-3.6 8.5-11.2" />
      )}
      {rank === 12 && (
        <>
          <path className="court-line court-stroke" d="M23.6 24.5c-2.9 4.3-3.3 8.4-1.2 12.4" />
          <path className="court-line court-stroke" d="M42.4 24.5c2.9 4.3 3.3 8.4 1.2 12.4" />
        </>
      )}
      <circle className="court-ink" cx="29.6" cy="25.6" r="1.5" />
      <circle className="court-ink" cx="36.4" cy="25.6" r="1.5" />
      <path className="court-ink-stroke" d="M29.8 31.4c1.6 1.5 5.8 1.5 7.4 0" />
      {CROWNS[rank]}
      {ACCESSORIES[rank]}
    </svg>
  )
}

/* --- The card ------------------------------------------------------------ */

export function PlayingCard({
  rank,
  suit,
  className,
  testId,
  style,
}: {
  rank: number
  suit: Suit
  className?: string
  testId?: string
  style?: React.CSSProperties
}) {
  const label = rankLabel(rank)
  const index = `pcard-index${label.length > 1 ? ' is-wide' : ''}`
  const pips = PIPS[rank]

  return (
    <div
      className={`pcard${isRedSuit(suit) ? ' is-red' : ''}${className ? ` ${className}` : ''}`}
      role="img"
      aria-label={cardName(rank, suit)}
      data-testid={testId}
      style={style}
    >
      <span className={index}>
        <span className="pcard-rank">{label}</span>
        <SuitGlyph suit={suit} />
      </span>

      {rank >= 11 ? (
        <div className="pcard-court">
          <div className="pcard-court-half">
            <CourtFigure rank={rank} suit={suit} />
          </div>
          <div className="pcard-court-half is-inverted">
            <CourtFigure rank={rank} suit={suit} />
          </div>
        </div>
      ) : pips ? (
        <div className="pcard-pips">
          {pips.map(([x, y], i) => (
            <SuitGlyph
              key={i}
              suit={suit}
              className={y > 50 ? 'is-inverted' : undefined}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="pcard-ace">
          <SuitGlyph suit={suit} />
        </div>
      )}

      <span className={`${index} is-inverted`}>
        <span className="pcard-rank">{label}</span>
        <SuitGlyph suit={suit} />
      </span>
    </div>
  )
}
