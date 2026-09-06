'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Phase, PublicState } from '@/lib/types'

export const POLL_INTERVALS: Record<Phase | 'default', number> = {
  RESULT: 600,
  BIDDING: 1200,
  LOBBY: 2500,
  GAMEOVER: 2500,
  default: 1500,
}

type ApiError = { code: string; message: string }

export function useRoomState(code: string, playerId: string | null) {
  const [state, setState] = useState<PublicState | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopped = useRef(false)
  const phaseRef = useRef<Phase | null>(null)

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  const poll = useCallback(async () => {
    if (!playerId || stopped.current) return
    try {
      const res = await fetch(`/api/room/${code}/state?playerId=${encodeURIComponent(playerId)}`)
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error ?? { code: 'UNKNOWN', message: 'request failed' })
      } else {
        setState(body.state as PublicState)
        phaseRef.current = (body.state as PublicState).phase
        setError(null)
      }
    } catch {
      setError({ code: 'NETWORK', message: 'reconnecting…' })
    } finally {
      if (!stopped.current && playerId && document.visibilityState !== 'hidden') {
        const ms = POLL_INTERVALS[phaseRef.current ?? 'default'] ?? POLL_INTERVALS.default
        clearTimer()
        timer.current = setTimeout(poll, ms)
      }
    }
  }, [code, playerId])

  useEffect(() => {
    stopped.current = false
    if (playerId) void poll()
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !stopped.current) void poll()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped.current = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [poll, playerId])

  const act = useCallback(
    async (path: 'bid' | 'rematch', payload: Record<string, unknown>) => {
      if (!playerId) return
      try {
        const res = await fetch(`/api/room/${code}/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ playerId, ...payload }),
        })
        const body = await res.json()
        if (!res.ok) setError(body?.error ?? { code: 'UNKNOWN', message: 'request failed' })
        else {
          setState(body.state as PublicState)
          phaseRef.current = (body.state as PublicState).phase
          setError(null)
        }
      } catch {
        setError({ code: 'NETWORK', message: 'reconnecting…' })
      }
    },
    [code, playerId],
  )

  return {
    state,
    error,
    actions: {
      bid: (card: number) => act('bid', { card }),
      rematch: () => act('rematch', {}),
    },
  }
}
