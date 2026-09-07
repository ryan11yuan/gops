'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { TieMode } from '@/lib/types'
import { AlertIcon, CharacterMark, Sparkle, Squiggle } from '@/components/Marks'

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
      <div className="brandbar">
        <span className="wordmark">Goofspiel Online</span>
      </div>

      <section className="hero">
        <div className="mark-row hero-marks">
          <CharacterMark seed={0} />
          <CharacterMark seed={1} />
          <Squiggle />
          <CharacterMark seed={2} />
          <CharacterMark seed={3} />
          <Sparkle />
          <CharacterMark seed={4} />
        </div>
        <h1 className="display">
          Read your rival. <span className="pill-word">Outbid</span> them.
        </h1>
        <p className="lede">
          Goofspiel — the Game of Pure Strategy. Bid smart, win the pile. Nothing is hidden but
          each other&rsquo;s nerve.
        </p>
      </section>

      <div className="home-grid">
        <form onSubmit={createRoom} className="surface form-card">
          <header>
            <h2 className="section-title">New game</h2>
            <p>Create a room, then send the link to whoever you want to beat.</p>
          </header>

          <label className="field">
            <span>Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="Ada"
              required
            />
          </label>

          <fieldset className="choices">
            <legend>On a tie</legend>
            <label className="choice">
              <input
                type="radio"
                name="tie"
                checked={tieMode === 'discard'}
                onChange={() => setTieMode('discard')}
              />
              <span className="choice-dot" aria-hidden="true" />
              <span className="choice-copy">
                <b>Discard the prize</b>
                <span>Default. Equal bids burn the card and nobody scores.</span>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="tie"
                checked={tieMode === 'carryover'}
                onChange={() => setTieMode('carryover')}
              />
              <span className="choice-dot" aria-hidden="true" />
              <span className="choice-copy">
                <b>Carry it over</b>
                <span>Equal bids roll the points into the next round&rsquo;s pot.</span>
              </span>
            </label>
          </fieldset>

          <button type="submit" className="btn btn-primary btn-lg" disabled={busy || !name.trim()}>
            {busy ? 'Creating room…' : 'Create room'}
          </button>
        </form>

        <div className="home-side">
          <form onSubmit={joinByCode} className="surface form-card">
            <header>
              <h2 className="section-title">Join a game</h2>
              <p>Got a four-character code from a friend?</p>
            </header>
            <label className="field">
              <span>Room code</span>
              <input
                type="text"
                className="code-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={4}
                placeholder="AB23"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button type="submit" className="btn btn-ghost btn-lg" disabled={!joinCode.trim()}>
              Join
            </button>
          </form>

          <section className="accent-panel rules-panel">
            <h2 className="section-title">How a round works</h2>
            <ol className="steps">
              <li>A prize card turns face up — Ace is 1 point, King is 13.</li>
              <li>You each bid one card from your own Ace-to-King hand, in secret.</li>
              <li>Higher bid takes the prize. Both cards are spent for good.</li>
            </ol>
          </section>
        </div>
      </div>

      {err && (
        <p role="alert" className="error">
          <AlertIcon />
          {err}
        </p>
      )}
    </main>
  )
}
