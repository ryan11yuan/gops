import { GameError } from '@/lib/types'
import type { RoomState, Seat, SeatState, TieMode, LogEntry } from '@/lib/types'
import { makeSeed, randomId, shuffle } from '@/lib/rng'

export const FULL_HAND: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
export const ROUNDS = 13
export const AUTO_ADVANCE_MS = 3000

function newSeat(playerId: string, name: string): SeatState {
  return { playerId, name, hand: [...FULL_HAND], spent: [], score: 0, wantsRematch: false }
}

export function createGame(opts: {
  code: string
  name: string
  tieMode: TieMode
  seed?: string
  now?: number
}): { state: RoomState; playerId: string } {
  const playerId = randomId()
  const now = opts.now ?? Date.now()
  const state: RoomState = {
    code: opts.code,
    createdAt: now,
    seed: opts.seed ?? makeSeed(),
    tieMode: opts.tieMode,
    phase: 'LOBBY',
    round: 1,
    prizeDeck: [],
    prizeCard: null,
    prizesRevealed: [],
    carry: 0,
    seats: { P1: { ...newSeat(playerId, opts.name), hand: [], spent: [] }, P2: null },
    bids: { P1: null, P2: null },
    log: [],
    revealedAt: null,
  }
  return { state, playerId }
}

export function seatForPlayer(state: RoomState, playerId: string): Seat | null {
  if (state.seats.P1?.playerId === playerId) return 'P1'
  if (state.seats.P2?.playerId === playerId) return 'P2'
  return null
}

export function startGame(state: RoomState, now?: number): RoomState {
  if (state.phase !== 'LOBBY') throw new GameError('WRONG_PHASE', 'game already started')
  if (!state.seats.P1 || !state.seats.P2) throw new GameError('WRONG_PHASE', 'need two players')
  const deck = shuffle(FULL_HAND, state.seed)
  return {
    ...state,
    phase: 'BIDDING',
    round: 1,
    prizeDeck: deck,
    prizeCard: deck[0],
    prizesRevealed: [deck[0]],
    carry: 0,
    seats: {
      P1: newSeat(state.seats.P1.playerId, state.seats.P1.name),
      P2: newSeat(state.seats.P2.playerId, state.seats.P2.name),
    },
    bids: { P1: null, P2: null },
    log: [],
    revealedAt: null,
  }
}

export function joinRoom(
  state: RoomState,
  opts: { name: string; playerId?: string; now?: number },
): { state: RoomState; playerId: string; seat: Seat } {
  if (opts.playerId) {
    const existing = seatForPlayer(state, opts.playerId)
    if (existing) return { state, playerId: opts.playerId, seat: existing }
  }
  if (state.seats.P1 && state.seats.P2) throw new GameError('ROOM_FULL', 'room is full')
  const seat: Seat = state.seats.P1 ? 'P2' : 'P1'
  const playerId = randomId()
  const withSeat: RoomState = {
    ...state,
    seats: { ...state.seats, [seat]: { ...newSeat(playerId, opts.name), hand: [], spent: [] } },
  }
  const next =
    withSeat.seats.P1 && withSeat.seats.P2 ? startGame(withSeat, opts.now) : withSeat
  return { state: next, playerId, seat }
}

function removeCard(hand: number[], card: number): number[] {
  const i = hand.indexOf(card)
  return [...hand.slice(0, i), ...hand.slice(i + 1)]
}

export function resolveRound(state: RoomState, now?: number): RoomState {
  const p1 = state.bids.P1
  const p2 = state.bids.P2
  if (p1 == null || p2 == null) throw new GameError('WRONG_PHASE', 'both bids required')
  const prize = state.prizeCard!
  const pot = prize + state.carry
  const isFinal = state.round >= ROUNDS

  let winner: LogEntry['winner']
  let awarded = 0
  let nextCarry = state.carry
  let carryApplied = 0

  if (p1 > p2) {
    winner = 'P1'
    awarded = pot
    carryApplied = state.carry
    nextCarry = 0
  } else if (p2 > p1) {
    winner = 'P2'
    awarded = pot
    carryApplied = state.carry
    nextCarry = 0
  } else {
    winner = 'TIE'
    nextCarry = state.tieMode === 'carryover' && !isFinal ? state.carry + prize : 0
  }

  const entry: LogEntry = {
    round: state.round,
    prize,
    carryApplied,
    p1Card: p1,
    p2Card: p2,
    winner,
    awarded,
  }

  return {
    ...state,
    phase: 'RESULT',
    revealedAt: now ?? Date.now(),
    carry: nextCarry,
    seats: {
      P1: {
        ...state.seats.P1,
        hand: removeCard(state.seats.P1.hand, p1),
        spent: [...state.seats.P1.spent, p1],
        score: state.seats.P1.score + (winner === 'P1' ? awarded : 0),
      },
      P2: {
        ...state.seats.P2!,
        hand: removeCard(state.seats.P2!.hand, p2),
        spent: [...state.seats.P2!.spent, p2],
        score: state.seats.P2!.score + (winner === 'P2' ? awarded : 0),
      },
    },
    log: [...state.log, entry],
  }
}

export function submitBid(state: RoomState, seat: Seat, card: number, now?: number): RoomState {
  if (state.phase !== 'BIDDING') throw new GameError('WRONG_PHASE', 'not accepting bids')
  const seatState = state.seats[seat]
  if (!seatState) throw new GameError('UNKNOWN_PLAYER', 'seat not occupied')
  if (state.bids[seat] != null) return state // idempotent once locked
  if (!seatState.hand.includes(card)) throw new GameError('INVALID_BID', `card ${card} not in hand`)

  let next: RoomState = { ...state, bids: { ...state.bids, [seat]: card } }
  if (next.bids.P1 != null && next.bids.P2 != null) next = resolveRound(next, now)
  return next
}

export function advanceRound(state: RoomState, now?: number): RoomState {
  if (state.phase !== 'RESULT') throw new GameError('WRONG_PHASE', 'no result to advance from')
  if (state.round >= ROUNDS) {
    return { ...state, phase: 'GAMEOVER', revealedAt: null, bids: { P1: null, P2: null } }
  }
  const nextRound = state.round + 1
  const nextPrize = state.prizeDeck[nextRound - 1]
  return {
    ...state,
    phase: 'BIDDING',
    round: nextRound,
    prizeCard: nextPrize,
    prizesRevealed: [...state.prizesRevealed, nextPrize],
    bids: { P1: null, P2: null },
    revealedAt: null,
  }
}

export function finalResult(state: RoomState): { p1: number; p2: number; winner: Seat | 'DRAW' } {
  const p1 = state.seats.P1.score
  const p2 = state.seats.P2?.score ?? 0
  const winner: Seat | 'DRAW' = p1 > p2 ? 'P1' : p2 > p1 ? 'P2' : 'DRAW'
  return { p1, p2, winner }
}
