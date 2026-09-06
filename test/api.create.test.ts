import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { loadRoom } from '@/lib/rooms'
import { POST as createRoom } from '@/app/api/room/route'

beforeEach(resetFakeRedis)

function req(body: unknown) {
  return new Request('http://test/api/room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/room', () => {
  it('creates a LOBBY room and returns the P1 view', async () => {
    const res = await createRoom(req({ name: 'Alice', tieMode: 'carryover' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    expect(json.seat).toBe('P1')
    expect(json.state.phase).toBe('LOBBY')
    expect(json.state.tieMode).toBe('carryover')
    expect(json.state.you.name).toBe('Alice')
    expect(json.state.opponent).toBeNull()

    const saved = await loadRoom(json.code)
    expect(saved?.seats.P1?.playerId).toBe(json.playerId)
  })

  it('defaults an unknown tieMode to discard and rejects a blank name', async () => {
    const ok = await createRoom(req({ name: '  Bob  ', tieMode: 'nonsense' }))
    expect((await ok.json()).state.tieMode).toBe('discard')

    const bad = await createRoom(req({ name: '   ', tieMode: 'discard' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('BAD_REQUEST')
  })
})
