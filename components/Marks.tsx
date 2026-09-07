/**
 * Decorative marks and icons.
 *
 * Character marks are flat illustrated faces inside a 2px accent-bordered
 * circle — visual punctuation only, never content. Suit pips live with the
 * card faces in PlayingCard. UI icons are drawn on a 16px grid at a 1.6
 * stroke so they sit at one weight.
 */

const MARK_COLORS = ['#097fe8', '#f64932', '#ffb110', '#62aef0'] as const

type Face = (props: { ink: string }) => React.ReactElement

const FACES: Face[] = [
  // Round eyes, wide smile
  ({ ink }) => (
    <>
      <circle cx="18" cy="21" r="2.4" fill={ink} />
      <circle cx="30" cy="21" r="2.4" fill={ink} />
      <path d="M16.5 28.5c1.9 3.4 5.1 5.1 7.5 5.1s5.6-1.7 7.5-5.1" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  // Arched eyes, small smile
  ({ ink }) => (
    <>
      <path d="M14.6 21.4c1-1.9 2.4-2.8 3.7-2.8s2.7.9 3.7 2.8" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M26 21.4c1-1.9 2.4-2.8 3.7-2.8s2.7.9 3.7 2.8" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
      <path d="M19.5 29.4c1.2 1.6 2.7 2.4 4.5 2.4s3.3-.8 4.5-2.4" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  // Wink
  ({ ink }) => (
    <>
      <path d="M14.8 21h5.4" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="30" cy="21" r="2.4" fill={ink} />
      <path d="M18.5 29c1.4 2 3.3 3 5.5 3s4.1-1 5.5-3" stroke={ink} strokeWidth="2.4" strokeLinecap="round" fill="none" />
    </>
  ),
  // Thinking — offset eyes, flat mouth
  ({ ink }) => (
    <>
      <circle cx="19" cy="20.5" r="2.4" fill={ink} />
      <circle cx="31" cy="20.5" r="2.4" fill={ink} />
      <path d="M18.5 30h9" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  // Surprised
  ({ ink }) => (
    <>
      <circle cx="18" cy="20.5" r="2.4" fill={ink} />
      <circle cx="30" cy="20.5" r="2.4" fill={ink} />
      <ellipse cx="24" cy="30" rx="3.2" ry="3.8" fill={ink} />
    </>
  ),
]

export function CharacterMark({ seed = 0, size = 44 }: { seed?: number; size?: number }) {
  const color = MARK_COLORS[seed % MARK_COLORS.length]
  const FaceGlyph = FACES[seed % FACES.length]
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="24" cy="24" r="22.5" fill="#ffffff" stroke={color} strokeWidth="2" />
      <FaceGlyph ink="rgba(0,0,0,0.85)" />
    </svg>
  )
}

export function Squiggle({ width = 40 }: { width?: number }) {
  return (
    <svg
      className="mark"
      width={width}
      height={width * 0.4}
      viewBox="0 0 40 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 11c3.5-8 6.5 4 10 0s6.5-9 10-4 6.5 6 8 1"
        stroke="#f64932"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Sparkle({ size = 22 }: { size?: number }) {
  return (
    <svg
      className="mark"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 1.5c.7 5.6 2.2 7.1 7.8 7.8-5.6.7-7.1 2.2-7.8 7.8-.7-5.6-2.2-7.1-7.8-7.8 5.6-.7 7.1-2.2 7.8-7.8Z"
        fill="#ffb110"
      />
      <path
        d="M19.5 15.5c.35 2.6 1.05 3.3 3.6 3.6-2.55.35-3.25 1.05-3.6 3.6-.35-2.55-1.05-3.25-3.6-3.6 2.55-.3 3.25-1 3.6-3.6Z"
        fill="#ffb110"
      />
    </svg>
  )
}

/* --- UI icons ----------------------------------------------------------- */

function icon(path: React.ReactNode, size: number) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {path}
    </svg>
  )
}

export function LinkIcon({ size = 15 }: { size?: number }) {
  return icon(
    <>
      <path d="M6.6 9.4a2.6 2.6 0 0 0 3.94.28l2-2a2.6 2.6 0 0 0-3.68-3.68l-1.15 1.14" />
      <path d="M9.4 6.6a2.6 2.6 0 0 0-3.94-.28l-2 2a2.6 2.6 0 0 0 3.68 3.68l1.14-1.14" />
    </>,
    size,
  )
}

export function CheckIcon({ size = 15 }: { size?: number }) {
  return icon(<path d="m3 8.4 3.3 3.3L13 5" />, size)
}

export function AlertIcon({ size = 15 }: { size?: number }) {
  return icon(
    <>
      <circle cx="8" cy="8" r="6.4" />
      <path d="M8 5v3.6" />
      <path d="M8 11h.01" />
    </>,
    size,
  )
}

export function ArrowLeftIcon({ size = 15 }: { size?: number }) {
  return icon(
    <>
      <path d="M12.5 8h-9" />
      <path d="M7 3.5 2.5 8 7 12.5" />
    </>,
    size,
  )
}

export function RefreshIcon({ size = 15 }: { size?: number }) {
  return icon(
    <>
      <path d="M13.4 7a5.5 5.5 0 1 0-.4 3.4" />
      <path d="M13.6 3.2v3.9h-3.9" />
    </>,
    size,
  )
}
