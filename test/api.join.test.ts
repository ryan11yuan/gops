import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'

beforeEach(resetFakeRedis)

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function makeRoom() {
  const res = await createRoom(jsonReq('http://test/api/room', { name: 'Alice', tieMode: 'discard' }))
  return res.json() as Promise<{ code: string; playerId: string }>
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

describe('POST /api/room/[code]/join', () => {
  it('second player fills P2 and the game auto-starts', async () => {
    const { code } = await makeRoom()
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Bob' }), ctx(code))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.seat).toBe('P2')
    expect(json.state.phase).toBe('BIDDING')
    expect(json.state.you.hand).toHaveLength(13)
    expect(json.state.opponent.name).toBe('Alice')
  })

  it('reconnect with a known playerId returns the same seat', async () => {
    const { code, playerId } = await makeRoom()
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { playerId }), ctx(code))
    const json = await res.json()
    expect(json.seat).toBe('P1')
    expect(json.playerId).toBe(playerId)
  })

  it('a third stranger is rejected with ROOM_FULL', async () => {
    const { code } = await makeRoom()
    await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Bob' }), ctx(code))
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Carol' }), ctx(code))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('ROOM_FULL')
  })

  it('joining a missing room is ROOM_NOT_FOUND', async () => {
    const res = await joinRoute(jsonReq('http://test/api/room/ZZZZ/join', { name: 'Bob' }), ctx('ZZZZ'))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('ROOM_NOT_FOUND')
  })
})
