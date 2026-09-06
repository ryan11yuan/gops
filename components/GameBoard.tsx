'use client'

import { useState } from 'react'
import type { PublicState } from '@/lib/types'
import { PrizePile } from '@/components/PrizePile'
import { Hand } from '@/components/Hand'
import { Scoreboard } from '@/components/Scoreboard'
import { RevealPanel } from '@/components/RevealPanel'
import { RoundLog } from '@/components/RoundLog'
import { StatusBanner } from '@/components/StatusBanner'
import { EndScreen } from '@/components/EndScreen'

type Actions = { bid: (card: number) => Promise<void>; rematch: () => Promise<void> }

function bannerMessage(state: PublicState, error: { message: string } | null): string | null {
  if (error) return error.message
  if (state.opponent && !state.opponent.connected)
    return 'Opponent disconnected — waiting to reconnect…'
  if (state.phase === 'BIDDING' && state.youLocked && !state.opponentLocked)
    return "Waiting for opponent's bid…"
  return null
}

export function GameBoard({
  state,
  error,
  actions,
  code,
}: {
  state: PublicState
  error: { code: string; message: string } | null
  actions: Actions
  code: string
}) {
  const [copied, setCopied] = useState(false)

  if (state.phase === 'LOBBY') {
    return (
      <main className="board lobby">
        <h1>Room <span className="code">{code}</span></h1>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
        <p role="status">Waiting for opponent to join…</p>
      </main>
    )
  }

  if (state.phase === 'GAMEOVER') {
    return <EndScreen state={state} onRematch={actions.rematch} />
  }

  const handDisabled = state.phase !== 'BIDDING' || state.youLocked || !state.opponent

  return (
    <main className="board">
      <Scoreboard you={state.you} opponent={state.opponent} round={state.round} />
      <PrizePile prizeCard={state.prizeCard} prizesRemaining={state.prizesRemaining} carry={state.carry} />
      {state.phase === 'RESULT' && state.reveal && (
        <RevealPanel
          reveal={state.reveal}
          youSeat={state.you.seat}
          autoAdvanceAt={state.autoAdvanceAt}
          now={Date.now()}
        />
      )}
      <StatusBanner message={bannerMessage(state, error)} />
      <Hand hand={state.you.hand} disabled={handDisabled} onPick={(card) => void actions.bid(card)} />
      <RoundLog log={state.log} youSeat={state.you.seat} />
    </main>
  )
}
