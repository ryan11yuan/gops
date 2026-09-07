import { describe, it, expect } from 'vitest'
import { carriedPrizeCards } from '@/lib/gameEngine'
import type { LogEntry } from '@/lib/types'

function entry(round: number, prize: number, winner: LogEntry['winner']): LogEntry {
  return {
    round,
    prize,
    carryApplied: 0,
    p1Card: winner === 'TIE' ? 5 : 9,
    p2Card: winner === 'TIE' ? 5 : 2,
    winner,
    awarded: winner === 'TIE' ? 0 : prize,
  }
}

describe('carriedPrizeCards', () => {
  it('returns nothing when no round has been played', () => {
    expect(carriedPrizeCards([], 'BIDDING')).toEqual([])
  })

  it('returns nothing when the last round had a winner', () => {
    const log = [entry(1, 5, 'TIE'), entry(2, 11, 'P1')]
    expect(carriedPrizeCards(log, 'BIDDING')).toEqual([])
  })

  it('carries the tied prize once the next prize has been dealt', () => {
    const log = [entry(1, 7, 'P2'), entry(2, 10, 'TIE')]
    expect(carriedPrizeCards(log, 'BIDDING')).toEqual([10])
  })

  it('holds the tied prize back while its own result is still on screen', () => {
    const log = [entry(1, 7, 'P2'), entry(2, 10, 'TIE')]
    expect(carriedPrizeCards(log, 'RESULT')).toEqual([])
  })

  it('returns a consecutive tie streak oldest-first', () => {
    const log = [entry(1, 7, 'P2'), entry(2, 10, 'TIE'), entry(3, 3, 'TIE'), entry(4, 12, 'TIE')]
    expect(carriedPrizeCards(log, 'BIDDING')).toEqual([10, 3, 12])
  })

  it('excludes the newest tie of a streak during RESULT', () => {
    const log = [entry(1, 10, 'TIE'), entry(2, 3, 'TIE'), entry(3, 12, 'TIE')]
    expect(carriedPrizeCards(log, 'RESULT')).toEqual([10, 3])
  })

  it('stops at the most recent round that was won', () => {
    const log = [entry(1, 4, 'TIE'), entry(2, 6, 'P1'), entry(3, 9, 'TIE')]
    expect(carriedPrizeCards(log, 'BIDDING')).toEqual([9])
  })
})
