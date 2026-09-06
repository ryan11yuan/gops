import { GameError } from '@/lib/types'
import type { RoomState, Seat, SeatState, TieMode } from '@/lib/types'
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
