import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { loadRoom } from '@/lib/rooms'

beforeEach(resetFakeRedis)

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

async function startedGame() {
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  return { code: c.code as string, p1: c.playerId as string, p2: j.playerId as string }
}

describe('POST /api/room/[code]/bid', () => {
  it('locks the caller and hides the value from the opponent until both are in', async () => {
    const { code, p1, p2 } = await startedGame()
    const r1 = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 10 }), ctx(code))
    const s1 = (await r1.json()).state
    expect(s1.youLocked).toBe(true)
    expect(s1.reveal).toBeNull()

    const r2 = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 4 }), ctx(code))
    const s2 = (await r2.json()).state
    expect(s2.phase).toBe('RESULT')
    expect(s2.reveal).toEqual({ p1Card: 10, p2Card: 4, winner: 'P1', awarded: expect.any(Number) })
  })

  it('rejects an unknown player and a non-integer card', async () => {
    const { code, p1 } = await startedGame()
    const stranger = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: 'nope', card: 5 }), ctx(code))
    expect(stranger.status).toBe(403)
    const bad = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 'x' }), ctx(code))
    expect(bad.status).toBe(400)
  })

  it('resolves exactly one round when both bids land concurrently', async () => {
    const { code, p1, p2 } = await startedGame()
    await Promise.all([
      bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 7 }), ctx(code)),
      bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 8 }), ctx(code)),
    ])
    const room = await loadRoom(code)
    expect(room?.log).toHaveLength(1)
    expect(room?.phase).toBe('RESULT')
  })
})
