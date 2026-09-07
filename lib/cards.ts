/**
 * Card faces.
 *
 * Ranks travel through the engine, the API and the log as 1..13 — the number is
 * also the point value a prize is worth. These helpers turn a stored rank into
 * what a player actually reads on the card: A, 2..10, J, Q, K.
 */

import type { Seat } from '@/lib/types'

const LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'] as const

const NAMES = [
  'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven',
  'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King',
] as const

/** Short face shown on a card: 1 -> "A", 12 -> "Q". */
export function rankLabel(card: number): string {
  return LABELS[card - 1] ?? String(card)
}

/** Spoken name, for accessible labels: 1 -> "Ace", 12 -> "Queen". */
export function rankName(card: number): string {
  return NAMES[card - 1] ?? String(card)
}

/* --- Suits ---------------------------------------------------------------
   A GOPS deck is four suits doing three jobs: diamonds are the prize deck the
   whole table plays for, and each seat holds one of the black suits. */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs'

export const PRIZE_SUIT: Suit = 'diamonds'

/** The suit a seat plays its whole hand in. */
export function seatSuit(seat: Seat): Suit {
  return seat === 'P1' ? 'spades' : 'clubs'
}

export function isRedSuit(suit: Suit): boolean {
  return suit === 'hearts' || suit === 'diamonds'
}

/** Full name of a card, for accessible labels: "Queen of spades". */
export function cardName(card: number, suit: Suit): string {
  return `${rankName(card)} of ${suit}`
}
