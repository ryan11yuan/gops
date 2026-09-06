import { Redis } from '@upstash/redis'
import { GameError } from '@/lib/types'

const url = process.env.UPSTASH_REDIS_REST_URL ?? ''
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? ''

const missing = [
  url ? null : 'UPSTASH_REDIS_REST_URL',
  token ? null : 'UPSTASH_REDIS_REST_TOKEN',
].filter((v): v is string => v !== null)

// Without credentials the Upstash client still constructs, then fails deep inside
// fetch with "Invalid URL" — which every route reports as a bare "unexpected
// error". Fail up front with the fix instead.
function unconfigured(): never {
  throw new GameError(
    'INTERNAL',
    `room storage is not configured — set ${missing.join(' and ')} (copy .env.local.example to .env.local; see README)`,
  )
}

export const redis = missing.length
  ? (new Proxy({} as Redis, { get: () => async () => unconfigured() }) as Redis)
  : new Redis({ url, token, automaticDeserialization: false })
