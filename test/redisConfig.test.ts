import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vi.resetModules() gives each dynamic import a fresh module graph, so GameError
// must be pulled from that same graph for instanceof to mean anything.
async function loadRedis() {
  const [{ redis }, { GameError }] = await Promise.all([
    import('@/lib/redis'),
    import('@/lib/types'),
  ])
  return { redis, GameError }
}

beforeEach(() => {
  vi.resetModules()
})
afterEach(() => {
  vi.unstubAllEnvs()
})

describe('lib/redis configuration guard', () => {
  it('rejects with an actionable GameError when the Upstash env vars are missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const { redis, GameError } = await loadRedis()

    const err = await redis.set('room:TEST', 'x').then(
      () => null,
      (e: unknown) => e,
    )

    expect(err).toBeInstanceOf(GameError)
    expect((err as InstanceType<typeof GameError>).code).toBe('INTERNAL')
    // Names the exact vars an operator has to set, instead of "unexpected error".
    expect((err as Error).message).toContain('UPSTASH_REDIS_REST_URL')
    expect((err as Error).message).toContain('UPSTASH_REDIS_REST_TOKEN')
  })

  it('names only the variable that is actually missing', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    const { redis, GameError } = await loadRedis()

    const err = (await redis.get('room:TEST').catch((e: unknown) => e)) as Error
    expect(err).toBeInstanceOf(GameError)
    expect(err.message).toContain('UPSTASH_REDIS_REST_TOKEN')
    expect(err.message).not.toContain('UPSTASH_REDIS_REST_URL')
  })

  it('uses the real Upstash client once both vars are set', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'token')
    const { redis } = await loadRedis()
    const { Redis } = await import('@upstash/redis')

    expect(redis).toBeInstanceOf(Redis)
  })
})
