'use client'

import { useState } from 'react'
import type { PublicState } from '@/lib/types'
import { PrizePile } from '@/components/PrizePile'
import { Hand } from '@/components/Hand'
import { Scoreboard } from '@/components/Scoreboard'
import { RevealPanel } from '@/components/RevealPanel'
import { RoundLog } from '@/components/RoundLog'
import { StatusBanner } from '@/components/StatusBanner'
import { seatSuit } from '@/lib/cards'
import { EndScreen } from '@/components/EndScreen'
import { CharacterMark, CheckIcon, LinkIcon } from '@/components/Marks'

type Actions = { bid: (card: number) => Promise<void>; rematch: () => Promise<void> }

type Banner = { message: string; tone: 'info' | 'alert' } | null

function banner(state: PublicState, error: { message: string } | null): Banner {
  if (error) return { message: error.message, tone: 'alert' }
  if (state.opponent && !state.opponent.connected)
    return { message: 'Opponent disconnected — waiting to reconnect…', tone: 'alert' }
  if (state.phase === 'BIDDING' && state.youLocked && !state.opponentLocked)
    return { message: 'Bid locked in — waiting for opponent…', tone: 'info' }
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
        <section className="surface lobby-card">
          <p className="caption">Room code</p>
          <h1 className="code">{code}</h1>
          <div className="lobby-seats">
            <CharacterMark seed={0} size={44} />
            <span className="seat-empty" aria-hidden="true" />
          </div>
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href)
                setCopied(true)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <CheckIcon /> : <LinkIcon />}
            {copied ? 'Link copied' : 'Copy invite link'}
          </button>
          <p className="waiting" role="status">
            <span className="waiting-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Waiting for opponent to join
          </p>
        </section>
      </main>
    )
  }

  if (state.phase === 'GAMEOVER') {
    return <EndScreen state={state} onRematch={actions.rematch} />
  }

  const handDisabled = state.phase !== 'BIDDING' || state.youLocked || !state.opponent
  const status = banner(state, error)

  return (
    <main className="board">
      <Scoreboard you={state.you} opponent={state.opponent} round={state.round} />
      <PrizePile
        prizeCard={state.prizeCard}
        prizesRemaining={state.prizesRemaining}
        carry={state.carry}
      />
      {state.phase === 'RESULT' && state.reveal && (
        <RevealPanel
          reveal={state.reveal}
          youSeat={state.you.seat}
          autoAdvanceAt={state.autoAdvanceAt}
          now={Date.now()}
        />
      )}
      <StatusBanner message={status?.message ?? null} tone={status?.tone} />
      <Hand
        hand={state.you.hand}
        suit={seatSuit(state.you.seat)}
        disabled={handDisabled}
        onPick={(card) => void actions.bid(card)}
      />
      <RoundLog log={state.log} youSeat={state.you.seat} />
    </main>
  )
}
