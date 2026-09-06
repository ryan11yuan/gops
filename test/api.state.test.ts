import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { GET as stateRoute } from '@/app/api/room/[code]/state/route'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })
const getReq = (code: string, playerId: string) =>
  new Request(`http://t/api/room/${code}/state?playerId=${encodeURIComponent(playerId)}`)

async function startedGame() {
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  return { code: c.code as string, p1: c.playerId as string, p2: j.playerId as string }
}

describe('GET /api/room/[code]/state', () => {
  it('returns the caller per-seat view and marks the caller seen', async () => {
    const { code, p1 } = await startedGame()
    const res = await stateRoute(getReq(code, p1), ctx(code))
    expect(res.status).toBe(200)
    const s = (await res.json()).state
    expect(s.you.seat).toBe('P1')
    expect(s.phase).toBe('BIDDING')
  })

  it('403 for an unknown playerId, 404 for a missing room, 400 without playerId', async () => {
    const { code } = await startedGame()
    expect((await stateRoute(getReq(code, 'nope'), ctx(code))).status).toBe(403)
    expect((await stateRoute(getReq('ZZZZ', 'x'), ctx('ZZZZ'))).status).toBe(404)
    expect((await stateRoute(new Request(`http://t/api/room/${code}/state`), ctx(code))).status).toBe(400)
  })

  it('performs the lazy auto-advance once 3s have passed since the reveal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { code, p1, p2 } = await startedGame()
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 5 }), ctx(code))
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 9 }), ctx(code))

    vi.setSystemTime(1000)
    let s = (await (await stateRoute(getReq(code, p1), ctx(code))).json()).state
    expect(s.phase).toBe('RESULT')

    vi.setSystemTime(3001)
    s = (await (await stateRoute(getReq(code, p1), ctx(code))).json()).state
    expect(s.phase).toBe('BIDDING')
    expect(s.round).toBe(2)
  })
})
