import { GameError } from '@/lib/types'
import type { ErrorCode } from '@/lib/types'

const STATUS: Record<string, number> = {
  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  WRONG_PHASE: 409,
  INVALID_BID: 400,
  UNKNOWN_PLAYER: 403,
  BAD_REQUEST: 400,
  LOCK_TIMEOUT: 503,
  INTERNAL: 500,
}

export function ok(data: unknown, status = 200): Response {
  return Response.json(data, { status })
}

export function fail(code: ErrorCode | 'INTERNAL', message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status })
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof GameError) return fail(e.code, e.message, STATUS[e.code] ?? 400)
    console.error('[api] unhandled error', e)
    return fail('INTERNAL', 'unexpected error', 500)
  }
}

export function sanitizeName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const cleaned = input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '') // strip control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
  return cleaned.length > 0 ? cleaned : null
}
