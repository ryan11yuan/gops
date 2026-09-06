import { redis } from '@/lib/redis'
import type { RoomState, Seat } from '@/lib/types'

export { generateCode } from '@/lib/rng'

export const ROOM_TTL_SECONDS = 7200

export function roomKey(code: string): string {
  return `room:${code.toUpperCase()}`
}
export function seenKey(code: string, seat: Seat): string {
  return `seen:${code.toUpperCase()}:${seat}`
}
export function lockKey(code: string): string {
  return `lock:room:${code.toUpperCase()}`
}

export async function loadRoom(code: string): Promise<RoomState | null> {
  const raw = await redis.get<string>(roomKey(code))
  if (raw == null) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as RoomState) : (raw as RoomState)
}

export async function saveRoom(state: RoomState): Promise<void> {
  await redis.set(roomKey(state.code), JSON.stringify(state), { ex: ROOM_TTL_SECONDS })
}
