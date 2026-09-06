import { withLock, loadRoom, saveRoom, readSeen } from '@/lib/rooms'
import { joinRoom, publicStateFor } from '@/lib/gameEngine'
import { ok, handle, sanitizeName } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; playerId?: unknown }
      | null
    const name = sanitizeName(body?.name) ?? 'Player'
    const playerId = typeof body?.playerId === 'string' ? body.playerId : undefined

    const result = await withLock(code, async () => {
      const state = await loadRoom(code)
      if (!state) throw new GameError('ROOM_NOT_FOUND', 'room not found')
      const joined = joinRoom(state, { name, playerId })
      await saveRoom(joined.state)
      const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
      return {
        playerId: joined.playerId,
        seat: joined.seat,
        state: publicStateFor(joined.state, joined.seat, Date.now(), seen),
      }
    })
    return ok(result)
  })
}
