// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PlayingCard } from '@/components/PlayingCard'

const pips = (el: HTMLElement) => el.querySelectorAll('.pcard-pips .suit').length

describe('PlayingCard', () => {
  it('shows the rank in both corners and names the card for screen readers', () => {
    render(<PlayingCard rank={12} suit="spades" testId="c" />)
    const card = screen.getByTestId('c')
    expect(card).toHaveAccessibleName('Queen of spades')
    expect(card.querySelectorAll('.pcard-index')).toHaveLength(2)
    expect(card.querySelector('.pcard-index')).toHaveTextContent('Q')
  })

  it('lays out one pip per point for the number cards', () => {
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { unmount } = render(<PlayingCard rank={rank} suit="hearts" testId="c" />)
      expect(pips(screen.getByTestId('c'))).toBe(rank)
      unmount()
    }
  })

  it('keeps every pip inside the card and mirrors the lower half', () => {
    for (const rank of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { unmount } = render(<PlayingCard rank={rank} suit="spades" testId="c" />)
      const placed = [...screen.getByTestId('c').querySelectorAll<HTMLElement>('.pcard-pips .suit')].map(
        (p) => ({
          x: parseFloat(p.style.left),
          y: parseFloat(p.style.top),
          inverted: p.classList.contains('is-inverted'),
        }),
      )
      for (const { x, y, inverted } of placed) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(100)
        expect(y).toBeGreaterThanOrEqual(0)
        expect(y).toBeLessThanOrEqual(100)
        expect(inverted).toBe(y > 50)
      }
      // Every layout but the seven reads the same upside down, as printed
      // decks do; the seven's extra pip sits above the middle only.
      if (rank !== 7) {
        const at = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`
        const flipped = placed.map((p) => at(100 - p.x, 100 - p.y)).sort()
        expect(placed.map((p) => at(p.x, p.y)).sort()).toEqual(flipped)
      }
      unmount()
    }
  })

  it('gives the ace a single oversized pip and no pip field', () => {
    render(<PlayingCard rank={1} suit="clubs" testId="c" />)
    const card = screen.getByTestId('c')
    expect(card.querySelector('.pcard-pips')).toBeNull()
    expect(card.querySelectorAll('.pcard-ace .suit')).toHaveLength(1)
  })

  it('draws a mirrored court panel for J, Q and K', () => {
    for (const rank of [11, 12, 13]) {
      const { unmount } = render(<PlayingCard rank={rank} suit="diamonds" testId="c" />)
      const card = screen.getByTestId('c')
      expect(card.querySelectorAll('.pcard-court-half')).toHaveLength(2)
      expect(card.querySelector('.pcard-court-half.is-inverted')).not.toBeNull()
      expect(pips(card)).toBe(0)
      unmount()
    }
  })

  it('marks the red suits so hearts and diamonds print red', () => {
    render(
      <>
        <PlayingCard rank={4} suit="hearts" testId="red" />
        <PlayingCard rank={4} suit="spades" testId="black" />
      </>,
    )
    expect(screen.getByTestId('red')).toHaveClass('is-red')
    expect(screen.getByTestId('black')).not.toHaveClass('is-red')
  })
})
