import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fakeRedis, resetFakeRedis } from './helpers/fakeRedis'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

describe('FakeRedis', () => {
  it('round-trips a string value', async () => {
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.get('k')).toBe('v')
  })

  it('honours nx: returns null and does not overwrite when the key exists', async () => {
    expect(await fakeRedis.set('k', 'first', { nx: true })).toBe('OK')
    expect(await fakeRedis.set('k', 'second', { nx: true })).toBeNull()
    expect(await fakeRedis.get('k')).toBe('first')
  })

  it('expires keys after px milliseconds', async () => {
    vi.useFakeTimers()
    await fakeRedis.set('k', 'v', { px: 1000 })
    vi.advanceTimersByTime(999)
    expect(await fakeRedis.get('k')).toBe('v')
    vi.advanceTimersByTime(2)
    expect(await fakeRedis.get('k')).toBeNull()
  })

  it('del removes a key and reports the count', async () => {
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.del('k')).toBe(1)
    expect(await fakeRedis.del('k')).toBe(0)
  })

  it('expire sets a TTL on an existing key only', async () => {
    expect(await fakeRedis.expire('missing', 5)).toBe(0)
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.expire('k', 5)).toBe(1)
  })
})
