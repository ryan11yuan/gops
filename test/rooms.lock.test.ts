import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { withLock, touchSeen, readSeen } from '@/lib/rooms'

beforeEach(resetFakeRedis)

describe('withLock', () => {
  it('serialises overlapping callers on the same code', async () => {
    const order: string[] = []
    const a = withLock('AB23', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 30))
      order.push('a-end')
      return 'a'
    })
    const b = withLock('AB23', async () => {
      order.push('b-start')
      order.push('b-end')
      return 'b'
    })
    await Promise.all([a, b])
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('does not block a different room code', async () => {
    let bRan = false
    await withLock('AAAA', async () => {
      await withLock('BBBB', async () => {
        bRan = true
      })
    })
    expect(bRan).toBe(true)
  })

  it('throws LOCK_TIMEOUT if the lock cannot be acquired', async () => {
    await withLock('AB23', async () => {
      await expect(
        withLock('AB23', async () => 'inner', { retries: 2, backoffMs: 5 }),
      ).rejects.toThrowError(/LOCK_TIMEOUT/)
    })
  })
})

describe('presence', () => {
  it('touchSeen writes a timestamp readSeen can read back', async () => {
    await touchSeen('AB23', 'P1', 12345)
    expect(await readSeen('AB23', 'P1')).toBe(12345)
    expect(await readSeen('AB23', 'P2')).toBeNull()
  })
})
