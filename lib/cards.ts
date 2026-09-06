/**
 * Card faces.
 *
 * Ranks travel through the engine, the API and the log as 1..13 — the number is
 * also the point value a prize is worth. These helpers turn a stored rank into
 * what a player actually reads on the card: A, 2..10, J, Q, K.
 */

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
