export type Seat = 'P1' | 'P2'
export type Phase = 'LOBBY' | 'BIDDING' | 'RESULT' | 'GAMEOVER'
export type TieMode = 'discard' | 'carryover'

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'WRONG_PHASE'
  | 'INVALID_BID'
  | 'UNKNOWN_PLAYER'
  | 'BAD_REQUEST'
  | 'LOCK_TIMEOUT'
  | 'INTERNAL'

export class GameError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(`${code}: ${message}`)
    this.name = 'GameError'
    this.code = code
  }
}

export interface SeatState {
  playerId: string
  name: string
  hand: number[]   // remaining cards; opponent's is SERVER-ONLY
  spent: number[]  // cards already played (public)
  score: number
  wantsRematch: boolean
}

export interface LogEntry {
  round: number
  prize: number         // face value contested this round
  carryApplied: number  // pre-existing carry folded into the pot (0 on a tie)
  p1Card: number
  p2Card: number
  winner: Seat | 'TIE'
  awarded: number       // points the winner gained (0 on TIE)
}

export interface RoomState {
  code: string
  createdAt: number
  seed: string
  tieMode: TieMode
  phase: Phase
  round: number          // 1..13
  prizeDeck: number[]    // full shuffled order — SERVER ONLY
  prizeCard: number | null
  prizesRevealed: number[]
  carry: number
  seats: { P1: SeatState; P2: SeatState | null }
  bids: { P1: number | null; P2: number | null }  // SERVER ONLY until both set
  log: LogEntry[]
  revealedAt: number | null
}

export interface PublicState {
  code: string
  phase: Phase
  tieMode: TieMode
  round: number
  you: { seat: Seat; name: string; hand: number[]; spent: number[]; score: number }
  opponent:
    | { name: string; cardsRemaining: number; spent: number[]; score: number; connected: boolean }
    | null
  prizeCard: number | null
  prizesRevealed: number[]
  prizesRemaining: number
  carry: number
  youLocked: boolean
  opponentLocked: boolean
  reveal: { p1Card: number; p2Card: number; winner: Seat | 'TIE'; awarded: number } | null
  log: LogEntry[]
  finalResult: { p1: number; p2: number; winner: Seat | 'DRAW' } | null
  autoAdvanceAt: number | null
  youWantRematch: boolean
  opponentWantsRematch: boolean
}
