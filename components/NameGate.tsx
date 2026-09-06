'use client'

import { useState } from 'react'

export function NameGate({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <main className="home">
      <h1>Join game</h1>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onSubmit(name.trim())
        }}
      >
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required />
        </label>
        <button type="submit" disabled={!name.trim()}>Join</button>
      </form>
    </main>
  )
}
