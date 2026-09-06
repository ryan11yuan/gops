import { describe, it, expect } from 'vitest'
import {
  createGame, joinRoom, submitBid, advanceRound, requestRematch, publicStateFor,
} from '@/lib/gameEngine'
import { playRound } from './helpers/engineHarness'

function game(tieMode: 'discard' | 'carryover' = 'discard') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed: 'seed-x', now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}
const NO_SEEN = { p1: null, p2: null }

describe('publicStateFor — secret-state guarantees', () => {
  it('never includes the prize deck ordering', () => {
    const g = game()
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub).not.toHaveProperty('prizeDeck')
    expect(JSON.stringify(pub)).not.toContain('"prizeDeck"')
    expect(pub.prizesRevealed).toEqual([g.prizeCard])
    expect(pub.prizesRemaining).toBe(12)
  })

  it('never includes the opponent hand, only a count + public spent', () => {
    const g = game()
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub.opponent).toMatchObject({ name: 'Bob', cardsRemaining: 13, spent: [], score: 0 })
    expect((pub.opponent as Record<string, unknown>).hand).toBeUndefined()
  })

  it('hides both bids while BIDDING and exposes them only at RESULT', () => {
    let g = game()
    g = submitBid(g, 'P1', 9, 100)
    const mid = publicStateFor(g, 'P2', 150, NO_SEEN)
    expect(mid.reveal).toBeNull()
    expect(mid.youLocked).toBe(false)
    expect(mid.opponentLocked).toBe(true)
    expect(JSON.stringify(mid)).not.toContain('"p1Card"')

    g = submitBid(g, 'P2', 2, 200)
    const done = publicStateFor(g, 'P2', 250, NO_SEEN)
    expect(done.reveal).toEqual({ p1Card: 9, p2Card: 2, winner: 'P1', awarded: g.prizeCard! })
    expect(done.autoAdvanceAt).toBe(200 + 3000)
  })

  it('derives opponent.connected from the seen timestamp', () => {
    const g = game()
    const online = publicStateFor(g, 'P1', 10_000, { p1: 10_000, p2: 9_500 })
    expect(online.opponent!.connected).toBe(true)
    const stale = publicStateFor(g, 'P1', 10_000, { p1: 10_000, p2: 100 })
    expect(stale.opponent!.connected).toBe(false)
  })

  it('exposes finalResult only at GAMEOVER', () => {
    let g = game()
    const p1 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) g = playRound(g, p1[i], p2[i])
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub.phase).toBe('GAMEOVER')
    expect(pub.finalResult).toEqual({ p1: g.seats.P1!.score, p2: g.seats.P2!.score, winner: expect.any(String) })
  })
})

describe('requestRematch', () => {
  function finishedGame() {
    let g = game()
    const p1 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) g = playRound(g, p1[i], p2[i])
    return g
  }

  it('waits for both seats then resets to a fresh BIDDING game with a new seed', () => {
    const done = finishedGame()
    const one = requestRematch(done, 'P1', 0)
    expect(one.phase).toBe('GAMEOVER')
    const both = requestRematch(one, 'P2', 0)
    expect(both.phase).toBe('BIDDING')
    expect(both.round).toBe(1)
    expect(both.seats.P1!.score).toBe(0)
    expect(both.seats.P2!.score).toBe(0)
    expect(both.seats.P1!.hand.length).toBe(13)
    expect(both.seats.P1!.wantsRematch).toBe(false)
    expect(both.seed).not.toBe(done.seed)
    expect(both.seats.P1!.name).toBe('Alice')
  })

  it('rejects a rematch request before GAMEOVER', () => {
    expect(() => requestRematch(game(), 'P1', 0)).toThrowError(/WRONG_PHASE/)
  })
})
