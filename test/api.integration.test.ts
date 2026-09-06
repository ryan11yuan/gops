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
const view = async (code: string, pid: string) =>
  (await (await stateRoute(new Request(`http://t/api/room/${code}/state?playerId=${pid}`), ctx(code))).json()).state

describe('full game via the HTTP handlers', () => {
  it('plays 13 rounds to a GAMEOVER whose scores sum to 91', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
    const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
    const { code } = c
    const p1: string = c.playerId
    const p2: string = j.playerId

    let clock = 0
    for (let round = 1; round <= 13; round++) {
      const before = await view(code, p1)
      expect(before.phase).toBe('BIDDING')
      expect(before.round).toBe(round)
      // P1 bids its highest, P2 its lowest each round (they tie once, at round 7)
      const p1Card = before.you.hand[before.you.hand.length - 1]
      const p2View = await view(code, p2)
      const p2Card = p2View.you.hand[0]
      clock += 10
      vi.setSystemTime(clock)
      await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: p1Card }), ctx(code))
      const afterBid = await view(code, p2)
      await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: p2Card }), ctx(code))
      const result = await view(code, p1)
      expect(result.phase).toBe('RESULT')
      expect(result.reveal).not.toBeNull()
      clock += 3001
      vi.setSystemTime(clock)
      await view(code, p1) // triggers auto-advance
    }

    const final = await view(code, p1)
    expect(final.phase).toBe('GAMEOVER')
    const discardedOnTies = final.log
      .filter((e: { winner: string }) => e.winner === 'TIE')
      .reduce((sum: number, e: { prize: number }) => sum + e.prize, 0)
    expect(final.finalResult!.p1 + final.finalResult!.p2 + discardedOnTies).toBe(91)
    expect(final.log).toHaveLength(13)
  })
})
