import { describe, it, expect } from 'vitest'

describe('tooling', () => {
  it('runs vitest and resolves the @/ alias', async () => {
    const mod = await import('@/lib/version')
    expect(mod.VERSION).toBe('0.1.0')
  })
})
