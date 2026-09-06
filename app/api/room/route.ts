import { redis } from '@/lib/redis'
import { generateCode, roomKey, saveRoom, ROOM_TTL_SECONDS } from '@/lib/rooms'
import { createGame, publicStateFor } from '@/lib/gameEngine'
import { ok, fail, handle, sanitizeName } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'
import type { TieMode } from '@/lib/types'

export async function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const body = (await request.json().catch(() => null)) as
      | { name?: unknown; tieMode?: unknown }
      | null
    const name = sanitizeName(body?.name)
    if (!name) return fail('BAD_REQUEST', 'name is required', 400)
    const tieMode: TieMode = body?.tieMode === 'carryover' ? 'carryover' : 'discard'

    let code = ''
    for (let i = 0; i < 6; i++) {
      const candidate = generateCode()
      const reserved = await redis.set(roomKey(candidate), '__reserving__', {
        nx: true,
        ex: ROOM_TTL_SECONDS,
      })
      if (reserved === 'OK') {
        code = candidate
        break
      }
    }
    if (!code) throw new GameError('INTERNAL', 'could not allocate a room code')

    const { state, playerId } = createGame({ code, name, tieMode })
    await saveRoom(state)
    return ok({
      code,
      playerId,
      seat: 'P1',
      state: publicStateFor(state, 'P1', Date.now(), { p1: null, p2: null }),
    })
  })
}
