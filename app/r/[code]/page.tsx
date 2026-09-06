'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { NameGate } from '@/components/NameGate'
import { GameBoard } from '@/components/GameBoard'
import { useRoomState } from '@/hooks/useRoomState'
import { AlertIcon, ArrowLeftIcon } from '@/components/Marks'

export default function RoomPage() {
  const params = useParams<{ code: string }>()
  const code = (params.code ?? '').toUpperCase()
  const storageKey = `gops:${code}`

  const [playerId, setPlayerId] = useState<string | null>(null)
  const [needsName, setNeedsName] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const joinAttempted = useRef(false)

  const doJoin = useCallback(
    async (payload: { playerId?: string; name?: string }) => {
      setJoinError(null)
      try {
        const res = await fetch(`/api/room/${code}/join`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const body = await res.json()
        if (!res.ok) {
          setJoinError(body?.error?.message ?? 'Could not join room')
          setNeedsName(!payload.name) // let a fresh joiner retry with a name
          return
        }
        localStorage.setItem(storageKey, body.playerId)
        setPlayerId(body.playerId)
        setNeedsName(false)
      } catch {
        setJoinError('Network error — retrying is safe')
      }
    },
    [code, storageKey],
  )

  useEffect(() => {
    if (joinAttempted.current) return
    joinAttempted.current = true
    const stored = localStorage.getItem(storageKey)
    if (stored) void doJoin({ playerId: stored })
    else setNeedsName(true)
  }, [doJoin, storageKey])

  const room = useRoomState(code, playerId)

  if (needsName) return <NameGate onSubmit={(name) => doJoin({ name })} />
  if (joinError && !playerId)
    return (
      <main className="home gate center-note">
        <h1 className="display-sm">Can&rsquo;t get in.</h1>
        <p role="alert" className="error">
          <AlertIcon />
          {joinError}
        </p>
        <Link href="/" className="btn btn-ghost">
          <ArrowLeftIcon />
          Back to home
        </Link>
      </main>
    )
  if (!room.state)
    return (
      <main className="home center-note">
        <p className="waiting" role="status">
          <span className="waiting-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Opening room {code}
        </p>
      </main>
    )
  return <GameBoard state={room.state} error={room.error} actions={room.actions} code={code} />
}
