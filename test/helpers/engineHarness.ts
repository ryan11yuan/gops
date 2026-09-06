import type { RoomState } from '@/lib/types'
import { submitBid, advanceRound } from '@/lib/gameEngine'

export function playRound(state: RoomState, p1Card: number, p2Card: number, now = 0): RoomState {
  let s = submitBid(state, 'P1', p1Card, now)
  s = submitBid(s, 'P2', p2Card, now)
  if (s.phase === 'RESULT') s = advanceRound(s, now)
  return s
}
