'use client'

import { useState } from 'react'
import { CharacterMark, Squiggle } from '@/components/Marks'

export function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <main className="home gate">
      <section className="hero">
        <div className="mark-row hero-marks">
          <CharacterMark seed={1} />
          <Squiggle />
          <CharacterMark seed={3} />
        </div>
        <h1 className="display-sm">
          Take a <span className="pill-word is-sky">seat</span>.
        </h1>
        <p className="lede">Your opponent is already at the table. Tell them who they&rsquo;re up against.</p>
      </section>

      <form
        className="surface form-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <label className="field">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Ada"
            required
            autoFocus
          />
        </label>
        <button type="submit" className="btn btn-primary btn-lg" disabled={!name.trim()}>
          Join game
        </button>
      </form>
    </main>
  )
}
