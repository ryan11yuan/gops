import { describe, it, expect } from 'vitest'
import { createGame, joinRoom, submitBid } from '@/lib/gameEngine'

function twoPlayerGame(tieMode: 'discard' | 'carryover' = 'discard') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed: 'seed-x', now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}

describe('submitBid', () => {
  it('locks one seat and does not reveal the other bid', () => {
    const g = twoPlayerGame()
    const after = submitBid(g, 'P1', 5, 100)
    expect(after.bids.P1).toBe(5)
    expect(after.bids.P2).toBeNull()
    expect(after.phase).toBe('BIDDING')
  })

  it('rejects a card not in hand', () => {
    const g = twoPlayerGame()
    expect(() => submitBid(g, 'P1', 99, 100)).toThrowError(/INVALID_BID/)
  })

  it('rejects a bid when phase is not BIDDING', () => {
    const { state } = createGame({ code: 'AB23', name: 'A', tieMode: 'discard', seed: 's', now: 0 })
    expect(() => submitBid(state, 'P1', 5, 100)).toThrowError(/WRONG_PHASE/)
  })

  it('is idempotent once a seat has locked (second bid ignored)', () => {
    const g = twoPlayerGame()
    const once = submitBid(g, 'P1', 5, 100)
    const twice = submitBid(once, 'P1', 9, 100)
    expect(twice.bids.P1).toBe(5)
  })

  it('resolves the round when the second bid arrives: higher card wins the prize value', () => {
    let g = twoPlayerGame()
    const prize = g.prizeCard!
    g = submitBid(g, 'P1', 10, 100)
    g = submitBid(g, 'P2', 3, 200)
    expect(g.phase).toBe('RESULT')
    expect(g.revealedAt).toBe(200)
    expect(g.seats.P1!.score).toBe(prize)
    expect(g.seats.P2!.score).toBe(0)
    expect(g.seats.P1!.hand).not.toContain(10)
    expect(g.seats.P1!.spent).toContain(10)
    expect(g.seats.P2!.spent).toContain(3)
    expect(g.bids).toEqual({ P1: 10, P2: 3 })
    const entry = g.log.at(-1)!
    expect(entry).toMatchObject({ round: 1, prize, p1Card: 10, p2Card: 3, winner: 'P1', awarded: prize, carryApplied: 0 })
  })

  it('discard mode: a tie scores nobody and leaves carry at 0', () => {
    let g = twoPlayerGame('discard')
    g = submitBid(g, 'P1', 7, 100)
    g = submitBid(g, 'P2', 7, 200)
    expect(g.phase).toBe('RESULT')
    expect(g.seats.P1!.score).toBe(0)
    expect(g.seats.P2!.score).toBe(0)
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'TIE', awarded: 0 })
    expect(g.seats.P1!.spent).toContain(7)
    expect(g.seats.P2!.spent).toContain(7)
  })
})
