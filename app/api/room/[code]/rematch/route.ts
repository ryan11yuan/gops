import { withLock, loadRoom, saveRoom, readSeen } from '@/lib/rooms'
import { seatForPlayer, requestRematch, publicStateFor } from '@/lib/gameEngine'
import { ok, handle } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null
    const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
    if (!playerId) throw new GameError('BAD_REQUEST', 'playerId is required')

    const state = await withLock(code, async () => {
      const room = await loadRoom(code)
      if (!room) throw new GameError('ROOM_NOT_FOUND', 'room not found')
      const seat = seatForPlayer(room, playerId)
      if (!seat) throw new GameError('UNKNOWN_PLAYER', 'unknown player')
      const next = requestRematch(room, seat, Date.now())
      await saveRoom(next)
      const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
      return publicStateFor(next, seat, Date.now(), seen)
    })
    return ok({ state })
  })
}
