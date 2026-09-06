import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

describe('production build', () => {
  it('next build completes', () => {
    // Upstash env not required at build time; provide empty values so the client constructs.
    const out = execSync('npx next build', {
      encoding: 'utf8',
      env: { ...process.env, UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' },
    })
    expect(out).toMatch(/Compiled successfully|Route \(app\)/)
  }, 180_000)
})
