'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TieMode } from '@/lib/types'

export function Home() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [tieMode, setTieMode] = useState<TieMode>('discard')
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function createRoom(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/room', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), tieMode }),
      })
      const body = await res.json()
      if (!res.ok) {
        setErr(body?.error?.message ?? 'Could not create room')
        return
      }
      localStorage.setItem(`gops:${body.code}`, body.playerId)
      router.push(`/r/${body.code}`)
    } finally {
      setBusy(false)
    }
  }

  function joinByCode(e: React.FormEvent) {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code) router.push(`/r/${code}`)
  }

  return (
    <main className="home">
      <h1>GOPS</h1>
      <p className="tagline">Goofspiel — the Game of Pure Strategy. Bid smart, win the pile.</p>

      <form onSubmit={createRoom} className="card">
        <h2>New game</h2>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        </label>
        <fieldset>
          <legend>On a tie</legend>
          <label>
            <input type="radio" name="tie" checked={tieMode === 'discard'} onChange={() => setTieMode('discard')} />
            Discard the prize (default)
          </label>
          <label>
            <input type="radio" name="tie" checked={tieMode === 'carryover'} onChange={() => setTieMode('carryover')} />
            Carry it over to the next round
          </label>
        </fieldset>
        <button type="submit" disabled={busy || !name.trim()}>Create room</button>
      </form>

      <form onSubmit={joinByCode} className="card">
        <h2>Join a game</h2>
        <label>
          Room code
          <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} maxLength={4} placeholder="AB23" />
        </label>
        <button type="submit" disabled={!joinCode.trim()}>Join</button>
      </form>

      {err && <p role="alert" className="error">{err}</p>}
    </main>
  )
}
