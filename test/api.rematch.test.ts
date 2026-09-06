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
import { POST as rematchRoute } from '@/app/api/room/[code]/rematch/route'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

async function playToGameOver() {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  const code = c.code as string
  const p1 = c.playerId as string
  const p2 = j.playerId as string
  const P1 = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  const P2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  let t = 0
  for (let i = 0; i < 13; i++) {
    t += 10
    vi.setSystemTime(t)
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: P1[i] }), ctx(code))
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: P2[i] }), ctx(code))
    t += 3001
    vi.setSystemTime(t)
    await stateRoute(new Request(`http://t/api/room/${code}/state?playerId=${p1}`), ctx(code))
  }
  return { code, p1, p2 }
}

describe('POST /api/room/[code]/rematch', () => {
  it('resets to a fresh game only after both players accept', async () => {
    const { code, p1, p2 } = await playToGameOver()
    const one = (await (await rematchRoute(jsonReq(`http://t/api/room/${code}/rematch`, { playerId: p1 }), ctx(code))).json()).state
    expect(one.phase).toBe('GAMEOVER')
    expect(one.youWantRematch).toBe(true)

    const two = (await (await rematchRoute(jsonReq(`http://t/api/room/${code}/rematch`, { playerId: p2 }), ctx(code))).json()).state
    expect(two.phase).toBe('BIDDING')
    expect(two.round).toBe(1)
    expect(two.you.score).toBe(0)
    expect(two.you.hand).toHaveLength(13)
  })

  it('rejects a rematch before the game is over', async () => {
    const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
    await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))
    const res = await rematchRoute(jsonReq(`http://t/api/room/${c.code}/rematch`, { playerId: c.playerId }), ctx(c.code))
    expect(res.status).toBe(409)
  })
})
