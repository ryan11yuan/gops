import { loadRoom, saveRoom, withLock, touchSeen, readSeen } from '@/lib/rooms'
import { seatForPlayer, advanceRound, publicStateFor, AUTO_ADVANCE_MS } from '@/lib/gameEngine'
import { ok, handle } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'
import type { RoomState } from '@/lib/types'

function advanceDue(state: RoomState, now: number): boolean {
  return state.phase === 'RESULT' && state.revealedAt != null && now >= state.revealedAt + AUTO_ADVANCE_MS
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const playerId = new URL(request.url).searchParams.get('playerId')
    if (!playerId) throw new GameError('BAD_REQUEST', 'playerId query param is required')

    let state = await loadRoom(code)
    if (!state) throw new GameError('ROOM_NOT_FOUND', 'room not found')
    const seat = seatForPlayer(state, playerId)
    if (!seat) throw new GameError('UNKNOWN_PLAYER', 'unknown player')

    await touchSeen(code, seat, Date.now())

    if (advanceDue(state, Date.now())) {
      state = await withLock(code, async () => {
        const fresh = await loadRoom(code)
        if (!fresh) throw new GameError('ROOM_NOT_FOUND', 'room not found')
        if (!advanceDue(fresh, Date.now())) return fresh
        const advanced = advanceRound(fresh, Date.now())
        await saveRoom(advanced)
        return advanced
      })
    }

    const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
    return ok({ state: publicStateFor(state, seat, Date.now(), seen) })
  })
}
