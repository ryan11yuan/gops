import { describe, it, expect } from 'vitest'
import { shuffle, generateCode, makeSeed, randomId } from '@/lib/rng'

const CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

describe('shuffle', () => {
  it('is a permutation of the input', () => {
    const out = shuffle(CARDS, 'seed-a')
    expect([...out].sort((a, b) => a - b)).toEqual(CARDS)
  })
  it('is deterministic for a given seed', () => {
    expect(shuffle(CARDS, 'seed-a')).toEqual(shuffle(CARDS, 'seed-a'))
  })
  it('differs across seeds', () => {
    expect(shuffle(CARDS, 'seed-a')).not.toEqual(shuffle(CARDS, 'seed-b'))
  })
  it('does not mutate the input', () => {
    const input = [...CARDS]
    shuffle(input, 'seed-a')
    expect(input).toEqual(CARDS)
  })
})

describe('generateCode', () => {
  it('is 4 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    }
  })
})

describe('ids', () => {
  it('makeSeed and randomId return distinct non-empty strings', () => {
    expect(makeSeed()).not.toEqual(makeSeed())
    expect(randomId().length).toBeGreaterThan(0)
  })
})
