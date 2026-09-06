import { describe, it, expect } from 'vitest'
import { createGame, joinRoom, submitBid, advanceRound, finalResult } from '@/lib/gameEngine'
import { playRound } from './helpers/engineHarness'

function game(tieMode: 'discard' | 'carryover', seed = 'seed-x') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed, now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}

describe('advanceRound', () => {
  it('flips the next prize and clears bids after a RESULT', () => {
    let g = game('discard')
    g = submitBid(g, 'P1', 1, 0)
    g = submitBid(g, 'P2', 2, 0)
    expect(g.phase).toBe('RESULT')
    g = advanceRound(g, 0)
    expect(g.phase).toBe('BIDDING')
    expect(g.round).toBe(2)
    expect(g.bids).toEqual({ P1: null, P2: null })
    expect(g.prizeCard).toBe(g.prizeDeck[1])
    expect(g.prizesRevealed).toEqual([g.prizeDeck[0], g.prizeDeck[1]])
  })

  it('rejects advancing when phase is not RESULT', () => {
    const g = game('discard')
    expect(() => advanceRound(g, 0)).toThrowError(/WRONG_PHASE/)
  })
})

describe('carryover mode', () => {
  it('stacks tied prize values and pays the next decisive winner pot + carry', () => {
    let g = game('carryover')
    const [c0, c1, c2] = g.prizeDeck
    g = playRound(g, 5, 5) // tie -> carry = c0
    expect(g.carry).toBe(c0)
    g = playRound(g, 6, 6) // tie -> carry = c0 + c1
    expect(g.carry).toBe(c0 + c1)
    g = submitBid(g, 'P1', 13, 0)
    g = submitBid(g, 'P2', 1, 0) // P1 wins c2 + carry
    expect(g.seats.P1!.score).toBe(c2 + c0 + c1)
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'P1', awarded: c2 + c0 + c1, carryApplied: c0 + c1 })
  })

  it('drops the carry on a tie in the final round', () => {
    // 11 decisive rounds leave BOTH players holding {6,7}; round 12 tie seeds carry, round 13 tie drops it.
    let g = game('carryover', 'seed-final')
    const p1 = [1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13]
    const p2 = [2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 1]
    for (let i = 0; i < 11; i++) g = playRound(g, p1[i], p2[i])
    expect(g.round).toBe(12)
    g = playRound(g, 6, 6) // round 12 tie -> carry = prizeDeck[11]
    expect(g.carry).toBe(g.prizeDeck[11])
    expect(g.round).toBe(13)
    g = submitBid(g, 'P1', 7, 0)
    g = submitBid(g, 'P2', 7, 0) // round 13 tie in carryover
    expect(g.phase).toBe('RESULT')
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'TIE', awarded: 0 })
    g = advanceRound(g, 0)
    expect(g.phase).toBe('GAMEOVER')
  })
})

describe('finalResult + full playthrough', () => {
  it('a tie-free 13-round game distributes exactly 91 points and names a winner', () => {
    let g = game('discard', 'seed-playthrough')
    // P1 plays one higher than P2 for rounds 1-12 (P1 wins those); P2 wins round 13. No ties => all 91 points awarded.
    const p1 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) {
      // last iteration: after playRound the game reaches GAMEOVER
      g = playRound(g, p1[i], p2[i])
    }
    expect(g.phase).toBe('GAMEOVER')
    const fr = finalResult(g)
    expect(fr.p1 + fr.p2).toBe(91)
    // P1 wins rounds where p1[i] > p2[i]; those prize values sum to fr.p1
    expect(fr.p1).toBe(g.seats.P1!.score)
    expect(fr.p2).toBe(g.seats.P2!.score)
    expect(fr.winner === 'P1' || fr.winner === 'P2' || fr.winner === 'DRAW').toBe(true)
  })

  it('reports DRAW on an equal split', () => {
    const g = game('discard')
    const drawn = { ...g, phase: 'GAMEOVER' as const,
      seats: { P1: { ...g.seats.P1!, score: 45 }, P2: { ...g.seats.P2!, score: 45 } } }
    expect(finalResult(drawn).winner).toBe('DRAW')
  })
})
