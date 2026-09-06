// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameBoard } from '@/components/GameBoard'
import type { PublicState } from '@/lib/types'

const base: PublicState = {
  code: 'AB23',
  phase: 'BIDDING',
  tieMode: 'discard',
  round: 1,
  you: { seat: 'P1', name: 'Alice', hand: [1, 2, 3, 12, 13], spent: [], score: 0 },
  opponent: { name: 'Bob', cardsRemaining: 5, spent: [], score: 0, connected: true },
  prizeCard: 7,
  prizesRevealed: [7],
  prizesRemaining: 12,
  carry: 0,
  youLocked: false,
  opponentLocked: false,
  reveal: null,
  log: [],
  finalResult: null,
  autoAdvanceAt: null,
  youWantRematch: false,
  opponentWantsRematch: false,
}
const actions = { bid: vi.fn(), rematch: vi.fn() }

describe('GameBoard', () => {
  it('LOBBY: shows the room code and a copy-link control', () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={{ ...base, phase: 'LOBBY', opponent: null }} />)
    expect(screen.getByText('AB23')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument()
  })

  it('BIDDING: clicking a card calls actions.bid', async () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={base} />)
    await userEvent.click(screen.getByRole('button', { name: '12' }))
    expect(actions.bid).toHaveBeenCalledWith(12)
  })

  it('BIDDING: after locking, the hand is disabled and a waiting banner shows', () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={{ ...base, youLocked: true }} />)
    expect(screen.getByRole('button', { name: '12' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for opponent/i)
  })

  it('BIDDING: a disconnected opponent shows the reconnect banner', () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, opponent: { ...base.opponent!, connected: false } }} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/disconnected/i)
  })

  it('RESULT: shows the reveal panel', () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, phase: 'RESULT', reveal: { p1Card: 13, p2Card: 2, winner: 'P1', awarded: 7 }, log: [{ round: 1, prize: 7, carryApplied: 0, p1Card: 13, p2Card: 2, winner: 'P1', awarded: 7 }] }} />,
    )
    expect(screen.getByLabelText(/round result/i)).toBeInTheDocument()
  })

  it('GAMEOVER: headline + rematch button that calls actions.rematch', async () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, phase: 'GAMEOVER', finalResult: { p1: 50, p2: 41, winner: 'P1' } }} />,
    )
    expect(screen.getByText(/you win/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /rematch/i }))
    expect(actions.rematch).toHaveBeenCalled()
  })
})
