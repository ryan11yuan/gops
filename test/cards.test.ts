import { describe, it, expect } from 'vitest'
import { rankLabel, rankName } from '@/lib/cards'
import { FULL_HAND } from '@/lib/gameEngine'

describe('rankLabel', () => {
  it('maps every rank in a hand to its face', () => {
    expect(FULL_HAND.map(rankLabel)).toEqual(
      ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    )
  })
  it('falls back to the raw number outside 1..13', () => {
    expect(rankLabel(0)).toBe('0')
    expect(rankLabel(14)).toBe('14')
  })
})

describe('rankName', () => {
  it('spells out the face cards', () => {
    expect(rankName(1)).toBe('Ace')
    expect(rankName(11)).toBe('Jack')
    expect(rankName(12)).toBe('Queen')
    expect(rankName(13)).toBe('King')
  })
})
