'use client'

// TEMPORARY visual-inspection harness. Delete after the design pass.
import type { PublicState } from '@/lib/types'
import { GameBoard } from '@/components/GameBoard'
import { NameGate } from '@/components/NameGate'
import { PlayingCard } from '@/components/PlayingCard'
import { FULL_HAND } from '@/lib/gameEngine'
import type { Suit } from '@/lib/cards'

const log = [
  { round: 1, prize: 7, carryApplied: 0, p1Card: 9, p2Card: 4, winner: 'P1' as const, awarded: 7 },
  { round: 2, prize: 13, carryApplied: 0, p1Card: 2, p2Card: 12, winner: 'P2' as const, awarded: 13 },
  { round: 3, prize: 5, carryApplied: 0, p1Card: 6, p2Card: 6, winner: 'TIE' as const, awarded: 0 },
  { round: 4, prize: 11, carryApplied: 5, p1Card: 13, p2Card: 8, winner: 'P1' as const, awarded: 16 },
]

const base: PublicState = {
  code: 'K4M9',
  phase: 'BIDDING',
  tieMode: 'carryover',
  round: 5,
  you: {
    seat: 'P1',
    name: 'Alexandra',
    hand: [1, 3, 4, 5, 7, 8, 10, 11, 12],
    spent: [2, 6, 9, 13],
    score: 23,
  },
  opponent: {
    name: 'Bartholomew',
    cardsRemaining: 9,
    spent: [4, 6, 8, 12],
    score: 13,
    connected: true,
  },
  prizeCard: 10,
  prizesRevealed: [7, 13, 5, 11, 10],
  prizesRemaining: 8,
  carry: 0,
  youLocked: false,
  opponentLocked: false,
  reveal: null,
  log,
  finalResult: null,
  autoAdvanceAt: null,
  youWantRematch: false,
  opponentWantsRematch: false,
}

const noop = async () => {}
const actions = { bid: noop, rematch: noop }

const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs']

export default function Preview() {
  return (
    <>
      <main className="board" style={{ gap: 16 }}>
        {SUITS.map((suit) => (
          <div key={suit} className="hand" style={{ justifyContent: 'flex-start' }}>
            {FULL_HAND.map((rank) => (
              <PlayingCard key={rank} rank={rank} suit={suit} />
            ))}
          </div>
        ))}
        <div className="prize-pile">
          <div className="prize-stack">
            <span className="pcard card-back is-back-2" />
            <span className="pcard card-back is-back-1" />
            <PlayingCard rank={13} suit="diamonds" className="prize-card" />
          </div>
          <div className="prize-meta">
            <p className="prize-label">On the table</p>
            <p className="prize-worth numeric">Worth 13 points</p>
          </div>
        </div>
      </main>
      <GameBoard state={{ ...base, phase: 'LOBBY' }} error={null} actions={actions} code="K4M9" />

      <GameBoard state={base} error={null} actions={actions} code="K4M9" />

      <GameBoard
        state={{ ...base, carry: 5, youLocked: true, prizeCard: 12 }}
        error={null}
        actions={actions}
        code="K4M9"
      />

      <GameBoard
        state={{
          ...base,
          phase: 'RESULT',
          reveal: { p1Card: 11, p2Card: 4, winner: 'P1', awarded: 10 },
          autoAdvanceAt: Date.now() + 3000,
        }}
        error={null}
        actions={actions}
        code="K4M9"
      />

      <GameBoard
        state={base}
        error={{ code: 'INTERNAL', message: 'Lost the connection — retrying.' }}
        actions={actions}
        code="K4M9"
      />

      <GameBoard
        state={{
          ...base,
          phase: 'GAMEOVER',
          finalResult: { p1: 52, p2: 39, winner: 'P1' },
          log,
        }}
        error={null}
        actions={actions}
        code="K4M9"
      />

      <GameBoard
        state={{
          ...base,
          phase: 'GAMEOVER',
          finalResult: { p1: 39, p2: 52, winner: 'P2' },
          youWantRematch: true,
          log,
        }}
        error={null}
        actions={actions}
        code="K4M9"
      />

      <NameGate onSubmit={() => {}} />
    </>
  )
}
