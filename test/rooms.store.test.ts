import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { fakeRedis, resetFakeRedis } from './helpers/fakeRedis'
import { roomKey, seenKey, lockKey, loadRoom, saveRoom, ROOM_TTL_SECONDS } from '@/lib/rooms'
import { createGame } from '@/lib/gameEngine'

beforeEach(resetFakeRedis)

describe('room keys', () => {
  it('upper-cases the code', () => {
    expect(roomKey('ab23')).toBe('room:AB23')
    expect(seenKey('ab23', 'P1')).toBe('seen:AB23:P1')
    expect(lockKey('ab23')).toBe('lock:room:AB23')
  })
})

describe('loadRoom / saveRoom', () => {
  it('round-trips a RoomState as JSON', async () => {
    const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode: 'discard', seed: 's', now: 1 })
    await saveRoom(state)
    const raw = await fakeRedis.get(roomKey('AB23'))
    expect(typeof raw).toBe('string')
    const loaded = await loadRoom('ab23')
    expect(loaded).toEqual(state)
  })

  it('returns null for an unknown room', async () => {
    expect(await loadRoom('ZZZZ')).toBeNull()
  })

  it('sets the 2-hour TTL on save', async () => {
    vi.useFakeTimers()
    const { state } = createGame({ code: 'AB23', name: 'A', tieMode: 'discard', seed: 's', now: 1 })
    await saveRoom(state)
    vi.advanceTimersByTime(ROOM_TTL_SECONDS * 1000 - 10)
    expect(await loadRoom('AB23')).not.toBeNull()
    vi.advanceTimersByTime(20)
    expect(await loadRoom('AB23')).toBeNull()
    vi.useRealTimers()
  })
})
