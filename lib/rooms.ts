import { redis } from '@/lib/redis'
import type { RoomState, Seat } from '@/lib/types'
import { GameError } from '@/lib/types'
import { randomId } from '@/lib/rng'

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

export const LOCK_TTL_MS = 3000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function withLock<T>(
  code: string,
  fn: () => Promise<T>,
  opts?: { retries?: number; backoffMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 8
  const backoffMs = opts?.backoffMs ?? 40
  const key = lockKey(code)
  const token = randomId()

  let acquired = false
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await redis.set(key, token, { nx: true, px: LOCK_TTL_MS })
    if (res === 'OK') {
      acquired = true
      break
    }
    if (attempt < retries) await sleep(backoffMs)
  }
  if (!acquired) throw new GameError('LOCK_TIMEOUT', 'room busy, try again')

  try {
    return await fn()
  } finally {
    const current = await redis.get<string>(key)
    if (current === token) await redis.del(key)
  }
}

export async function touchSeen(code: string, seat: Seat, now?: number): Promise<void> {
  await redis.set(seenKey(code, seat), String(now ?? Date.now()), { ex: 30 })
}

export async function readSeen(code: string, seat: Seat): Promise<number | null> {
  const v = await redis.get<string>(seenKey(code, seat))
  return v == null ? null : Number(v)
}
