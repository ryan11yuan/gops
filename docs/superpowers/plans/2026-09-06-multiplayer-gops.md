# Multiplayer GOPS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real-time, link-shared, 2-player web game of Goofspiel (GOPS) on Next.js, deployable to Vercel, with all authoritative game state held server-side.

**Architecture:** Next.js App Router. A pure TypeScript rules engine (`lib/gameEngine.ts`) is the single source of truth for game logic and is exercised entirely by unit tests. Route Handlers under `app/api/` are thin adapters: acquire a per-room lock, load the room JSON blob from Upstash Redis, call the engine, save, and return only the caller's per-seat public view. Clients hold no authoritative state — they render whatever the server pushes and re-fetch on an adaptive polling interval. Presence is tracked in tiny standalone Redis keys so the frequent poll path never takes the write lock.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.6, `@upstash/redis`, Vitest + `@testing-library/react` + jsdom. No bundler beyond Next; native fetch; no CSS framework.

**Spec:** `docs/superpowers/specs/2026-09-06-multiplayer-gops-design.md` — read it alongside this plan. The plan implements that spec; where a step needs a rule or value, it is copied here, but the spec carries the rationale.

## Global Constraints

Every task's requirements implicitly include this section. Values are verbatim from the spec.

- **Framework:** Next.js App Router, React, TypeScript. Route Handlers run on the default Node runtime (no `edge` directive).
- **State store:** Upstash Redis via `@upstash/redis`, constructed with `automaticDeserialization: false` (all values are strings; `rooms.ts` does explicit `JSON.stringify` / `JSON.parse`).
- **Room blob:** one key per room, `room:{code}`, value = `JSON.stringify(RoomState)`, written with `{ ex: 7200 }` (2-hour sliding TTL) on every save. TTL doubles as room reaping — no cron.
- **Presence keys:** `seen:{code}:{seat}`, value = `String(Date.now())`, written with `{ ex: 30 }`, lock-free, on every `state` poll. Not stored in the blob.
- **Lock key:** `lock:room:{code}`, acquired with `{ nx: true, px: 3000 }`. Every write to the room blob (`join`, `bid`, `rematch`, and the lazy auto-advance) goes through `withLock`. The plain `state` read is lock-free unless it performs the auto-advance.
- **Room code:** 4 characters drawn from the alphabet `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no ambiguous glyphs). Codes are compared/stored uppercase.
- **Deck:** 13 rounds. Each seat's starting hand is exactly `[1,2,3,4,5,6,7,8,9,10,11,12,13]`. The prize deck is a seeded permutation of the same 13 values.
- **Determinism:** the shuffle is seeded Fisher–Yates keyed by `RoomState.seed` (stored in the room). A game is fully replayable from its seed.
- **Tie handling:** room-level `tieMode`, chosen at creation, locked once the game leaves `LOBBY`. `discard` (default) — tied prize is discarded, nobody scores, `carry` stays 0. `carryover` — tied prize value is added to `carry`; the next decisive round's winner takes `prizeCard + carry` and `carry` resets to 0; repeated ties stack. **A tie on round 13 in `carryover` mode drops the carry** (nobody scores it).
- **Scoring:** winner of a decisive round gains `prizeCard + carry`. Total points across a tie-free game = 91. Final equal score is a **draw**.
- **Auto-advance:** `RESULT → BIDDING/GAMEOVER` happens 3000 ms after `RoomState.revealedAt`, performed lazily inside the next `bid` or `state` call under the lock.
- **Polling intervals (client):** `RESULT` 600 ms, `BIDDING` 1200 ms, `LOBBY`/`GAMEOVER` 2500 ms, fallback 1500 ms. Polling pauses while `document.visibilityState === 'hidden'` and fires once immediately on return to visible.
- **Presence threshold:** `opponent.connected = (seen != null) && (now - seen < 8000)`.
- **Client identity:** on join the server issues a random `playerId`; the client stores it in `localStorage` under the key `gops:{code}`. Reconnect = `join` with that `playerId`.
- **Secret state — never present in any `PublicState`:** the `prizeDeck` ordering, the opponent's remaining `hand`, or either bid value while `phase === 'BIDDING'`.
- **Errors:** JSON body `{ error: { code, message } }` plus HTTP status. Codes → status: `ROOM_NOT_FOUND` 404, `ROOM_FULL` 409, `WRONG_PHASE` 409, `INVALID_BID` 400, `UNKNOWN_PLAYER` 403, `BAD_REQUEST` 400, `LOCK_TIMEOUT` 503, `INTERNAL` 500.
- **Tests:** Vitest. No live Upstash in any test — `@/lib/redis` is mocked with an in-memory `FakeRedis`. Each task is TDD: failing test → run it red → minimal implementation → run it green → commit.
- **Commit trailer:** every commit message ends with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Path alias:** `@/*` maps to the project root (`tsconfig.json` `paths`).

---

## File Structure

**Created by this plan (all paths relative to `gops-game/`):**

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `.env.local.example`, `next-env.d.ts` | Tooling / config (Task 1) |
| `app/layout.tsx` | Root HTML shell (Task 1) |
| `app/globals.css` | All styling, incl. the reveal flip transition (Task 1 stub, Task 19 finished) |
| `app/page.tsx` | Home route — renders `<Home />` (Task 16) |
| `app/r/[code]/page.tsx` | Room route — identity resolution + mounts `<GameBoard />` (Task 16) |
| `app/api/room/route.ts` | `POST` create room (Task 10) |
| `app/api/room/[code]/join/route.ts` | `POST` join / reconnect (Task 11) |
| `app/api/room/[code]/bid/route.ts` | `POST` submit bid (Task 12) |
| `app/api/room/[code]/state/route.ts` | `GET` per-seat state + lazy auto-advance (Task 13) |
| `app/api/room/[code]/rematch/route.ts` | `POST` rematch accept (Task 14) |
| `lib/types.ts` | All shared types + `GameError` class (Task 2) |
| `lib/rng.ts` | `randomId`, `makeSeed`, seeded `shuffle`, `generateCode` (Task 2) |
| `lib/gameEngine.ts` | Pure rules: create/start/join/bid/resolve/advance/rematch/publicState/finalResult (Tasks 3–6) |
| `lib/redis.ts` | Upstash client singleton (Task 7) |
| `lib/rooms.ts` | Keys, load/save, `withLock`, presence, `ROOM_TTL_SECONDS`, `LOCK_TTL_MS` (Tasks 8–9) |
| `lib/apiHelpers.ts` | `ok`, `fail`, `handle`, `sanitizeName` (Task 10) |
| `hooks/useRoomState.ts` | Adaptive visibility-aware polling hook + `actions` (Task 15) |
| `components/Home.tsx` | Create-room form + join-by-code (Task 16) |
| `components/NameGate.tsx` | Name entry for a first-time joiner (Task 16) |
| `components/GameBoard.tsx` | Top-level room view, switches on `phase` (Task 18) |
| `components/PrizePile.tsx` | Face-down count + current prize + carry badge (Task 17) |
| `components/Hand.tsx` | Selectable card row, spent/locked disabling (Task 17) |
| `components/Scoreboard.tsx` | Names, scores, round `n / 13` (Task 17) |
| `components/RevealPanel.tsx` | Both bids side by side, winner highlight, countdown (Task 17) |
| `components/RoundLog.tsx` | Scrollable per-round history (Task 17) |
| `components/StatusBanner.tsx` | Waiting / disconnected / reconnecting / ended messages (Task 17) |
| `components/EndScreen.tsx` | Final scores, winner/draw, log, rematch button (Task 18) |
| `test/helpers/fakeRedis.ts` | In-memory `FakeRedis` implementing the used ops (Task 7) |
| `test/helpers/engineHarness.ts` | Small helpers to drive scripted games in tests (Task 5) |
| `test/*.test.ts(x)` | One test file per unit, listed in its task | 
| `README.md` | Run-local + Vercel deploy instructions (Task 19) |

---

## Task 1: Project scaffold + test tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `vitest.config.ts`, `vitest.setup.ts`, `.gitignore`, `.env.local.example`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Next app (`npm run dev`), `npm test` wired to Vitest, `@/*` path alias, `npm run typecheck`.

- [ ] **Step 1: Write the failing test**

`test/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('tooling', () => {
  it('runs vitest and resolves the @/ alias', async () => {
    const mod = await import('@/lib/version')
    expect(mod.VERSION).toBe('0.1.0')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/smoke.test.ts`
Expected: FAIL — Vitest not installed / config missing / `@/lib/version` unresolved.

- [ ] **Step 3: Write the scaffold**

`package.json`:
```json
{
  "name": "gops-game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@upstash/redis": "^1.34.3",
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "eslint": "^9.17.0",
    "eslint-config-next": "^15.1.0",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {}
export default nextConfig
```

`next-env.d.ts`:
```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
```
Component/hook test files opt into jsdom with a top-of-file docblock: `// @vitest-environment jsdom`.

`vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
```

`.gitignore`:
```
node_modules/
.next/
out/
coverage/
*.tsbuildinfo
.env*.local
.DS_Store
```

`.env.local.example`:
```
# Upstash Redis (Vercel Marketplace injects these automatically in production).
# For local dev: create a free database at https://console.upstash.com and paste its REST creds.
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

`app/layout.tsx`:
```tsx
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'GOPS', description: 'Goofspiel — Game of Pure Strategy' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
```

`app/globals.css` (stub — finished in Task 19):
```css
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.5 system-ui, sans-serif; }
```

`app/page.tsx` (placeholder — replaced in Task 16):
```tsx
export default function HomePage() {
  return <main style={{ padding: 24 }}>GOPS — coming together.</main>
}
```

`lib/version.ts`:
```ts
export const VERSION = '0.1.0'
```

- [ ] **Step 4: Install and run**

Run: `npm install && npx vitest run test/smoke.test.ts && npm run typecheck`
Expected: test PASS; `tsc --noEmit` reports no errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app + vitest tooling

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Shared types + seeded RNG

**Files:**
- Create: `lib/types.ts`, `lib/rng.ts`
- Test: `test/rng.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `lib/types.ts`: `type Seat = 'P1' | 'P2'`; `type Phase = 'LOBBY' | 'BIDDING' | 'RESULT' | 'GAMEOVER'`; `type TieMode = 'discard' | 'carryover'`; `type ErrorCode = 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'WRONG_PHASE' | 'INVALID_BID' | 'UNKNOWN_PLAYER' | 'BAD_REQUEST' | 'LOCK_TIMEOUT' | 'INTERNAL'`; interfaces `SeatState`, `LogEntry`, `RoomState`, `PublicState` (exact shapes below); `class GameError extends Error { code: ErrorCode }`.
  - `lib/rng.ts`: `randomId(): string`; `makeSeed(): string`; `shuffle<T>(arr: readonly T[], seed: string): T[]`; `generateCode(len?: number): string`.

- [ ] **Step 1: Write the failing test**

`test/rng.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { shuffle, generateCode, makeSeed, randomId } from '@/lib/rng'

const CARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

describe('shuffle', () => {
  it('is a permutation of the input', () => {
    const out = shuffle(CARDS, 'seed-a')
    expect([...out].sort((a, b) => a - b)).toEqual(CARDS)
  })
  it('is deterministic for a given seed', () => {
    expect(shuffle(CARDS, 'seed-a')).toEqual(shuffle(CARDS, 'seed-a'))
  })
  it('differs across seeds', () => {
    expect(shuffle(CARDS, 'seed-a')).not.toEqual(shuffle(CARDS, 'seed-b'))
  })
  it('does not mutate the input', () => {
    const input = [...CARDS]
    shuffle(input, 'seed-a')
    expect(input).toEqual(CARDS)
  })
})

describe('generateCode', () => {
  it('is 4 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    }
  })
})

describe('ids', () => {
  it('makeSeed and randomId return distinct non-empty strings', () => {
    expect(makeSeed()).not.toEqual(makeSeed())
    expect(randomId().length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rng.test.ts`
Expected: FAIL — `@/lib/rng` has no exports.

- [ ] **Step 3: Write the implementation**

`lib/rng.ts`:
```ts
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function randomId(): string {
  return crypto.randomUUID()
}

export function makeSeed(): string {
  return crypto.randomUUID()
}

export function generateCode(len = 4): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let s = ''
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length]
  return s
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    h ^= h >>> 16
    return h >>> 0
  }
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(arr: readonly T[], seed: string): T[] {
  const rand = mulberry32(xmur3(seed)())
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
```

`lib/types.ts`:
```ts
export type Seat = 'P1' | 'P2'
export type Phase = 'LOBBY' | 'BIDDING' | 'RESULT' | 'GAMEOVER'
export type TieMode = 'discard' | 'carryover'

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'WRONG_PHASE'
  | 'INVALID_BID'
  | 'UNKNOWN_PLAYER'
  | 'BAD_REQUEST'
  | 'LOCK_TIMEOUT'
  | 'INTERNAL'

export class GameError extends Error {
  code: ErrorCode
  constructor(code: ErrorCode, message: string) {
    super(message)
    this.name = 'GameError'
    this.code = code
  }
}

export interface SeatState {
  playerId: string
  name: string
  hand: number[]   // remaining cards; opponent's is SERVER-ONLY
  spent: number[]  // cards already played (public)
  score: number
  wantsRematch: boolean
}

export interface LogEntry {
  round: number
  prize: number         // face value contested this round
  carryApplied: number  // pre-existing carry folded into the pot (0 on a tie)
  p1Card: number
  p2Card: number
  winner: Seat | 'TIE'
  awarded: number       // points the winner gained (0 on TIE)
}

export interface RoomState {
  code: string
  createdAt: number
  seed: string
  tieMode: TieMode
  phase: Phase
  round: number          // 1..13
  prizeDeck: number[]    // full shuffled order — SERVER ONLY
  prizeCard: number | null
  prizesRevealed: number[]
  carry: number
  seats: { P1: SeatState; P2: SeatState | null }
  bids: { P1: number | null; P2: number | null }  // SERVER ONLY until both set
  log: LogEntry[]
  revealedAt: number | null
}

export interface PublicState {
  code: string
  phase: Phase
  tieMode: TieMode
  round: number
  you: { seat: Seat; name: string; hand: number[]; spent: number[]; score: number }
  opponent:
    | { name: string; cardsRemaining: number; spent: number[]; score: number; connected: boolean }
    | null
  prizeCard: number | null
  prizesRevealed: number[]
  prizesRemaining: number
  carry: number
  youLocked: boolean
  opponentLocked: boolean
  reveal: { p1Card: number; p2Card: number; winner: Seat | 'TIE'; awarded: number } | null
  log: LogEntry[]
  finalResult: { p1: number; p2: number; winner: Seat | 'DRAW' } | null
  autoAdvanceAt: number | null
  youWantRematch: boolean
  opponentWantsRematch: boolean
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/rng.test.ts && npm run typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/rng.ts test/rng.test.ts
git commit -m "feat: shared types + seeded RNG

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Engine — createGame, startGame, joinRoom, seatForPlayer

**Files:**
- Create: `lib/gameEngine.ts`
- Test: `test/gameEngine.create.test.ts`

**Interfaces:**
- Consumes: `lib/types.ts` (`RoomState`, `SeatState`, `Seat`, `TieMode`, `GameError`), `lib/rng.ts` (`shuffle`, `randomId`, `makeSeed`).
- Produces:
  - `createGame(opts: { code: string; name: string; tieMode: TieMode; seed?: string; now?: number }): { state: RoomState; playerId: string }`
  - `startGame(state: RoomState, now?: number): RoomState`
  - `joinRoom(state: RoomState, opts: { name: string; playerId?: string; now?: number }): { state: RoomState; playerId: string; seat: Seat }`
  - `seatForPlayer(state: RoomState, playerId: string): Seat | null`
  - `const FULL_HAND: readonly number[]` = `[1..13]`

- [ ] **Step 1: Write the failing test**

`test/gameEngine.create.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createGame, startGame, joinRoom, seatForPlayer, FULL_HAND } from '@/lib/gameEngine'

function fresh() {
  return createGame({ code: 'AB23', name: 'Alice', tieMode: 'discard', seed: 'seed-x', now: 1000 })
}

describe('createGame', () => {
  it('creates a LOBBY room with P1 filled and P2 empty', () => {
    const { state, playerId } = fresh()
    expect(state.phase).toBe('LOBBY')
    expect(state.code).toBe('AB23')
    expect(state.tieMode).toBe('discard')
    expect(state.seats.P1?.playerId).toBe(playerId)
    expect(state.seats.P1?.name).toBe('Alice')
    expect(state.seats.P2).toBeNull()
    expect(state.round).toBe(1)
    expect(state.carry).toBe(0)
    expect(state.prizeDeck).toEqual([])
  })
})

describe('joinRoom', () => {
  it('adds P2 and auto-starts the game when both seats are filled', () => {
    const { state } = fresh()
    const { state: started, seat, playerId } = joinRoom(state, { name: 'Bob', now: 2000 })
    expect(seat).toBe('P2')
    expect(started.phase).toBe('BIDDING')
    expect(started.seats.P2?.name).toBe('Bob')
    expect(started.seats.P2?.playerId).toBe(playerId)
    expect([...started.seats.P1!.hand]).toEqual([...FULL_HAND])
    expect([...started.seats.P2!.hand]).toEqual([...FULL_HAND])
    expect([...started.prizeDeck].sort((a, b) => a - b)).toEqual([...FULL_HAND])
    expect(started.prizeCard).toBe(started.prizeDeck[0])
    expect(started.prizesRevealed).toEqual([started.prizeDeck[0]])
    expect(started.round).toBe(1)
  })

  it('reconnect: joining with a known playerId returns that seat unchanged', () => {
    const { state } = fresh()
    const p1Id = state.seats.P1!.playerId
    const { seat, state: same } = joinRoom(state, { name: 'ignored', playerId: p1Id })
    expect(seat).toBe('P1')
    expect(same.phase).toBe('LOBBY')
  })

  it('throws ROOM_FULL when both seats are taken and playerId is unknown', () => {
    const { state } = fresh()
    const { state: full } = joinRoom(state, { name: 'Bob' })
    expect(() => joinRoom(full, { name: 'Carol' })).toThrowError(/ROOM_FULL/)
  })
})

describe('seatForPlayer', () => {
  it('resolves ids to seats and returns null for strangers', () => {
    const { state } = fresh()
    const { state: full } = joinRoom(state, { name: 'Bob' })
    expect(seatForPlayer(full, full.seats.P1!.playerId)).toBe('P1')
    expect(seatForPlayer(full, full.seats.P2!.playerId)).toBe('P2')
    expect(seatForPlayer(full, 'nope')).toBeNull()
  })
})

describe('startGame', () => {
  it('rejects starting without two players', () => {
    const { state } = fresh()
    expect(() => startGame(state)).toThrowError(/WRONG_PHASE/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gameEngine.create.test.ts`
Expected: FAIL — `@/lib/gameEngine` has no exports.

- [ ] **Step 3: Write the implementation**

`lib/gameEngine.ts`:
```ts
import { GameError } from '@/lib/types'
import type { RoomState, Seat, SeatState, TieMode } from '@/lib/types'
import { makeSeed, randomId, shuffle } from '@/lib/rng'

export const FULL_HAND: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
export const ROUNDS = 13
export const AUTO_ADVANCE_MS = 3000

function newSeat(playerId: string, name: string): SeatState {
  return { playerId, name, hand: [...FULL_HAND], spent: [], score: 0, wantsRematch: false }
}

export function createGame(opts: {
  code: string
  name: string
  tieMode: TieMode
  seed?: string
  now?: number
}): { state: RoomState; playerId: string } {
  const playerId = randomId()
  const now = opts.now ?? Date.now()
  const state: RoomState = {
    code: opts.code,
    createdAt: now,
    seed: opts.seed ?? makeSeed(),
    tieMode: opts.tieMode,
    phase: 'LOBBY',
    round: 1,
    prizeDeck: [],
    prizeCard: null,
    prizesRevealed: [],
    carry: 0,
    seats: { P1: { ...newSeat(playerId, opts.name), hand: [], spent: [] }, P2: null },
    bids: { P1: null, P2: null },
    log: [],
    revealedAt: null,
  }
  return { state, playerId }
}

export function seatForPlayer(state: RoomState, playerId: string): Seat | null {
  if (state.seats.P1?.playerId === playerId) return 'P1'
  if (state.seats.P2?.playerId === playerId) return 'P2'
  return null
}

export function startGame(state: RoomState, now?: number): RoomState {
  if (state.phase !== 'LOBBY') throw new GameError('WRONG_PHASE', 'game already started')
  if (!state.seats.P1 || !state.seats.P2) throw new GameError('WRONG_PHASE', 'need two players')
  const deck = shuffle(FULL_HAND, state.seed)
  return {
    ...state,
    phase: 'BIDDING',
    round: 1,
    prizeDeck: deck,
    prizeCard: deck[0],
    prizesRevealed: [deck[0]],
    carry: 0,
    seats: {
      P1: newSeat(state.seats.P1.playerId, state.seats.P1.name),
      P2: newSeat(state.seats.P2.playerId, state.seats.P2.name),
    },
    bids: { P1: null, P2: null },
    log: [],
    revealedAt: null,
  }
}

export function joinRoom(
  state: RoomState,
  opts: { name: string; playerId?: string; now?: number },
): { state: RoomState; playerId: string; seat: Seat } {
  if (opts.playerId) {
    const existing = seatForPlayer(state, opts.playerId)
    if (existing) return { state, playerId: opts.playerId, seat: existing }
  }
  if (state.seats.P1 && state.seats.P2) throw new GameError('ROOM_FULL', 'room is full')
  const seat: Seat = state.seats.P1 ? 'P2' : 'P1'
  const playerId = randomId()
  const withSeat: RoomState = {
    ...state,
    seats: { ...state.seats, [seat]: { ...newSeat(playerId, opts.name), hand: [], spent: [] } },
  }
  const next =
    withSeat.seats.P1 && withSeat.seats.P2 ? startGame(withSeat, opts.now) : withSeat
  return { state: next, playerId, seat }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gameEngine.create.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gameEngine.ts test/gameEngine.create.test.ts
git commit -m "feat: engine create/start/join

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Engine — submitBid + resolveRound (discard mode)

**Files:**
- Modify: `lib/gameEngine.ts`
- Test: `test/gameEngine.bid.test.ts`

**Interfaces:**
- Consumes: Task 3 exports.
- Produces:
  - `submitBid(state: RoomState, seat: Seat, card: number, now?: number): RoomState`
  - `resolveRound(state: RoomState, now?: number): RoomState` (exported for tests; also called internally by `submitBid` when both bids are in)

- [ ] **Step 1: Write the failing test**

`test/gameEngine.bid.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createGame, joinRoom, submitBid } from '@/lib/gameEngine'

function twoPlayerGame(tieMode: 'discard' | 'carryover' = 'discard') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed: 'seed-x', now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}

describe('submitBid', () => {
  it('locks one seat and does not reveal the other bid', () => {
    const g = twoPlayerGame()
    const after = submitBid(g, 'P1', 5, 100)
    expect(after.bids.P1).toBe(5)
    expect(after.bids.P2).toBeNull()
    expect(after.phase).toBe('BIDDING')
  })

  it('rejects a card not in hand', () => {
    const g = twoPlayerGame()
    expect(() => submitBid(g, 'P1', 99, 100)).toThrowError(/INVALID_BID/)
  })

  it('rejects a bid when phase is not BIDDING', () => {
    const { state } = createGame({ code: 'AB23', name: 'A', tieMode: 'discard', seed: 's', now: 0 })
    expect(() => submitBid(state, 'P1', 5, 100)).toThrowError(/WRONG_PHASE/)
  })

  it('is idempotent once a seat has locked (second bid ignored)', () => {
    const g = twoPlayerGame()
    const once = submitBid(g, 'P1', 5, 100)
    const twice = submitBid(once, 'P1', 9, 100)
    expect(twice.bids.P1).toBe(5)
  })

  it('resolves the round when the second bid arrives: higher card wins the prize value', () => {
    let g = twoPlayerGame()
    const prize = g.prizeCard!
    g = submitBid(g, 'P1', 10, 100)
    g = submitBid(g, 'P2', 3, 200)
    expect(g.phase).toBe('RESULT')
    expect(g.revealedAt).toBe(200)
    expect(g.seats.P1!.score).toBe(prize)
    expect(g.seats.P2!.score).toBe(0)
    expect(g.seats.P1!.hand).not.toContain(10)
    expect(g.seats.P1!.spent).toContain(10)
    expect(g.seats.P2!.spent).toContain(3)
    expect(g.bids).toEqual({ P1: 10, P2: 3 })
    const entry = g.log.at(-1)!
    expect(entry).toMatchObject({ round: 1, prize, p1Card: 10, p2Card: 3, winner: 'P1', awarded: prize, carryApplied: 0 })
  })

  it('discard mode: a tie scores nobody and leaves carry at 0', () => {
    let g = twoPlayerGame('discard')
    g = submitBid(g, 'P1', 7, 100)
    g = submitBid(g, 'P2', 7, 200)
    expect(g.phase).toBe('RESULT')
    expect(g.seats.P1!.score).toBe(0)
    expect(g.seats.P2!.score).toBe(0)
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'TIE', awarded: 0 })
    expect(g.seats.P1!.spent).toContain(7)
    expect(g.seats.P2!.spent).toContain(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gameEngine.bid.test.ts`
Expected: FAIL — `submitBid` not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/gameEngine.ts`:
```ts
import type { LogEntry } from '@/lib/types'

function removeCard(hand: number[], card: number): number[] {
  const i = hand.indexOf(card)
  return [...hand.slice(0, i), ...hand.slice(i + 1)]
}

export function resolveRound(state: RoomState, now?: number): RoomState {
  const p1 = state.bids.P1
  const p2 = state.bids.P2
  if (p1 == null || p2 == null) throw new GameError('WRONG_PHASE', 'both bids required')
  const prize = state.prizeCard!
  const pot = prize + state.carry
  const isFinal = state.round >= ROUNDS

  let winner: LogEntry['winner']
  let awarded = 0
  let nextCarry = state.carry
  let carryApplied = 0

  if (p1 > p2) {
    winner = 'P1'
    awarded = pot
    carryApplied = state.carry
    nextCarry = 0
  } else if (p2 > p1) {
    winner = 'P2'
    awarded = pot
    carryApplied = state.carry
    nextCarry = 0
  } else {
    winner = 'TIE'
    nextCarry = state.tieMode === 'carryover' && !isFinal ? state.carry + prize : 0
  }

  const entry: LogEntry = {
    round: state.round,
    prize,
    carryApplied,
    p1Card: p1,
    p2Card: p2,
    winner,
    awarded,
  }

  return {
    ...state,
    phase: 'RESULT',
    revealedAt: now ?? Date.now(),
    carry: nextCarry,
    seats: {
      P1: {
        ...state.seats.P1,
        hand: removeCard(state.seats.P1.hand, p1),
        spent: [...state.seats.P1.spent, p1],
        score: state.seats.P1.score + (winner === 'P1' ? awarded : 0),
      },
      P2: {
        ...state.seats.P2!,
        hand: removeCard(state.seats.P2!.hand, p2),
        spent: [...state.seats.P2!.spent, p2],
        score: state.seats.P2!.score + (winner === 'P2' ? awarded : 0),
      },
    },
    log: [...state.log, entry],
  }
}

export function submitBid(state: RoomState, seat: Seat, card: number, now?: number): RoomState {
  if (state.phase !== 'BIDDING') throw new GameError('WRONG_PHASE', 'not accepting bids')
  const seatState = state.seats[seat]
  if (!seatState) throw new GameError('UNKNOWN_PLAYER', 'seat not occupied')
  if (state.bids[seat] != null) return state // idempotent once locked
  if (!seatState.hand.includes(card)) throw new GameError('INVALID_BID', `card ${card} not in hand`)

  let next: RoomState = { ...state, bids: { ...state.bids, [seat]: card } }
  if (next.bids.P1 != null && next.bids.P2 != null) next = resolveRound(next, now)
  return next
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gameEngine.bid.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gameEngine.ts test/gameEngine.bid.test.ts
git commit -m "feat: engine bidding + round resolution (discard mode)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Engine — carryover mode, advanceRound, finalResult, full playthrough

**Files:**
- Modify: `lib/gameEngine.ts`
- Create: `test/helpers/engineHarness.ts`
- Test: `test/gameEngine.flow.test.ts`

**Interfaces:**
- Consumes: Task 3–4 exports.
- Produces:
  - `advanceRound(state: RoomState, now?: number): RoomState`
  - `finalResult(state: RoomState): { p1: number; p2: number; winner: Seat | 'DRAW' }`
  - `test/helpers/engineHarness.ts`: `playRound(state, p1Card, p2Card, now?): RoomState` (submits both bids then, if `RESULT`, calls `advanceRound`)

- [ ] **Step 1: Write the failing test**

`test/helpers/engineHarness.ts`:
```ts
import type { RoomState } from '@/lib/types'
import { submitBid, advanceRound } from '@/lib/gameEngine'

export function playRound(state: RoomState, p1Card: number, p2Card: number, now = 0): RoomState {
  let s = submitBid(state, 'P1', p1Card, now)
  s = submitBid(s, 'P2', p2Card, now)
  if (s.phase === 'RESULT') s = advanceRound(s, now)
  return s
}
```

`test/gameEngine.flow.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { createGame, joinRoom, submitBid, advanceRound, finalResult } from '@/lib/gameEngine'
import { playRound } from './helpers/engineHarness'

function game(tieMode: 'discard' | 'carryover', seed = 'seed-x') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed, now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}

describe('advanceRound', () => {
  it('flips the next prize and clears bids after a RESULT', () => {
    let g = game('discard')
    g = submitBid(g, 'P1', 1, 0)
    g = submitBid(g, 'P2', 2, 0)
    expect(g.phase).toBe('RESULT')
    g = advanceRound(g, 0)
    expect(g.phase).toBe('BIDDING')
    expect(g.round).toBe(2)
    expect(g.bids).toEqual({ P1: null, P2: null })
    expect(g.prizeCard).toBe(g.prizeDeck[1])
    expect(g.prizesRevealed).toEqual([g.prizeDeck[0], g.prizeDeck[1]])
  })

  it('rejects advancing when phase is not RESULT', () => {
    const g = game('discard')
    expect(() => advanceRound(g, 0)).toThrowError(/WRONG_PHASE/)
  })
})

describe('carryover mode', () => {
  it('stacks tied prize values and pays the next decisive winner pot + carry', () => {
    let g = game('carryover')
    const [c0, c1, c2] = g.prizeDeck
    g = playRound(g, 5, 5) // tie -> carry = c0
    expect(g.carry).toBe(c0)
    g = playRound(g, 6, 6) // tie -> carry = c0 + c1
    expect(g.carry).toBe(c0 + c1)
    g = submitBid(g, 'P1', 13, 0)
    g = submitBid(g, 'P2', 1, 0) // P1 wins c2 + carry
    expect(g.seats.P1!.score).toBe(c2 + c0 + c1)
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'P1', awarded: c2 + c0 + c1, carryApplied: c0 + c1 })
  })

  it('drops the carry on a tie in the final round', () => {
    // Build a game to round 13 with a non-zero carry, then tie round 13.
    let g = game('carryover', 'seed-final')
    // rounds 1..11 decisive (alternate), round 12 tie to seed carry, round 13 tie.
    const p1 = [13, 1, 12, 2, 11, 3, 10, 4, 9, 5, 8]
    const p2 = [1, 13, 2, 12, 3, 11, 4, 10, 5, 9, 6]
    for (let i = 0; i < 11; i++) g = playRound(g, p1[i], p2[i])
    expect(g.round).toBe(12)
    g = playRound(g, 7, 7) // round 12 tie -> carry = prizeDeck[11]
    expect(g.carry).toBe(g.prizeDeck[11])
    expect(g.round).toBe(13)
    g = submitBid(g, 'P1', 6, 0)
    g = submitBid(g, 'P2', 6, 0) // round 13 tie in carryover
    expect(g.phase).toBe('RESULT')
    expect(g.carry).toBe(0)
    expect(g.log.at(-1)).toMatchObject({ winner: 'TIE', awarded: 0 })
    g = advanceRound(g, 0)
    expect(g.phase).toBe('GAMEOVER')
  })
})

describe('finalResult + full playthrough', () => {
  it('a tie-free 13-round game distributes exactly 91 points and names a winner', () => {
    let g = game('discard', 'seed-playthrough')
    // P1 always plays one higher than P2 except where impossible; simplest: P1 plays 13..1, P2 plays 1..13.
    const p1 = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) {
      // last iteration: after playRound the game reaches GAMEOVER
      g = playRound(g, p1[i], p2[i])
    }
    expect(g.phase).toBe('GAMEOVER')
    const fr = finalResult(g)
    expect(fr.p1 + fr.p2).toBe(91)
    // P1 wins rounds where p1[i] > p2[i]; those prize values sum to fr.p1
    expect(fr.p1).toBe(g.seats.P1!.score)
    expect(fr.p2).toBe(g.seats.P2!.score)
    expect(fr.winner === 'P1' || fr.winner === 'P2' || fr.winner === 'DRAW').toBe(true)
  })

  it('reports DRAW on an equal split', () => {
    const g = game('discard')
    const drawn = { ...g, phase: 'GAMEOVER' as const,
      seats: { P1: { ...g.seats.P1!, score: 45 }, P2: { ...g.seats.P2!, score: 45 } } }
    expect(finalResult(drawn).winner).toBe('DRAW')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gameEngine.flow.test.ts`
Expected: FAIL — `advanceRound` / `finalResult` not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/gameEngine.ts`:
```ts
export function advanceRound(state: RoomState, now?: number): RoomState {
  if (state.phase !== 'RESULT') throw new GameError('WRONG_PHASE', 'no result to advance from')
  if (state.round >= ROUNDS) {
    return { ...state, phase: 'GAMEOVER', revealedAt: null, bids: { P1: null, P2: null } }
  }
  const nextRound = state.round + 1
  const nextPrize = state.prizeDeck[nextRound - 1]
  return {
    ...state,
    phase: 'BIDDING',
    round: nextRound,
    prizeCard: nextPrize,
    prizesRevealed: [...state.prizesRevealed, nextPrize],
    bids: { P1: null, P2: null },
    revealedAt: null,
  }
}

export function finalResult(state: RoomState): { p1: number; p2: number; winner: Seat | 'DRAW' } {
  const p1 = state.seats.P1.score
  const p2 = state.seats.P2?.score ?? 0
  const winner: Seat | 'DRAW' = p1 > p2 ? 'P1' : p2 > p1 ? 'P2' : 'DRAW'
  return { p1, p2, winner }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gameEngine.flow.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gameEngine.ts test/helpers/engineHarness.ts test/gameEngine.flow.test.ts
git commit -m "feat: engine carryover mode, advance, final result

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Engine — publicStateFor + requestRematch + secret-state guarantees

**Files:**
- Modify: `lib/gameEngine.ts`
- Test: `test/gameEngine.public.test.ts`

**Interfaces:**
- Consumes: Task 3–5 exports.
- Produces:
  - `publicStateFor(state: RoomState, seat: Seat, now: number, seen: { p1: number | null; p2: number | null }): PublicState`
  - `requestRematch(state: RoomState, seat: Seat, now?: number): RoomState`
  - `const AUTO_ADVANCE_MS = 3000` (already defined in Task 3; referenced here)

- [ ] **Step 1: Write the failing test**

`test/gameEngine.public.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  createGame, joinRoom, submitBid, advanceRound, requestRematch, publicStateFor,
} from '@/lib/gameEngine'
import { playRound } from './helpers/engineHarness'

function game(tieMode: 'discard' | 'carryover' = 'discard') {
  const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode, seed: 'seed-x', now: 0 })
  return joinRoom(state, { name: 'Bob', now: 0 }).state
}
const NO_SEEN = { p1: null, p2: null }

describe('publicStateFor — secret-state guarantees', () => {
  it('never includes the prize deck ordering', () => {
    const g = game()
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub).not.toHaveProperty('prizeDeck')
    expect(JSON.stringify(pub)).not.toContain('"prizeDeck"')
    expect(pub.prizesRevealed).toEqual([g.prizeCard])
    expect(pub.prizesRemaining).toBe(12)
  })

  it('never includes the opponent hand, only a count + public spent', () => {
    const g = game()
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub.opponent).toMatchObject({ name: 'Bob', cardsRemaining: 13, spent: [], score: 0 })
    expect((pub.opponent as Record<string, unknown>).hand).toBeUndefined()
  })

  it('hides both bids while BIDDING and exposes them only at RESULT', () => {
    let g = game()
    g = submitBid(g, 'P1', 9, 100)
    const mid = publicStateFor(g, 'P2', 150, NO_SEEN)
    expect(mid.reveal).toBeNull()
    expect(mid.youLocked).toBe(false)
    expect(mid.opponentLocked).toBe(true)
    expect(JSON.stringify(mid)).not.toContain('"p1Card"')

    g = submitBid(g, 'P2', 2, 200)
    const done = publicStateFor(g, 'P2', 250, NO_SEEN)
    expect(done.reveal).toEqual({ p1Card: 9, p2Card: 2, winner: 'P1', awarded: g.prizeCard! })
    expect(done.autoAdvanceAt).toBe(200 + 3000)
  })

  it('derives opponent.connected from the seen timestamp', () => {
    const g = game()
    const online = publicStateFor(g, 'P1', 10_000, { p1: 10_000, p2: 9_500 })
    expect(online.opponent!.connected).toBe(true)
    const stale = publicStateFor(g, 'P1', 10_000, { p1: 10_000, p2: 100 })
    expect(stale.opponent!.connected).toBe(false)
  })

  it('exposes finalResult only at GAMEOVER', () => {
    let g = game()
    const p1 = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) g = playRound(g, p1[i], p2[i])
    const pub = publicStateFor(g, 'P1', 1000, NO_SEEN)
    expect(pub.phase).toBe('GAMEOVER')
    expect(pub.finalResult).toEqual({ p1: g.seats.P1!.score, p2: g.seats.P2!.score, winner: expect.any(String) })
  })
})

describe('requestRematch', () => {
  function finishedGame() {
    let g = game()
    const p1 = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    const p2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
    for (let i = 0; i < 13; i++) g = playRound(g, p1[i], p2[i])
    return g
  }

  it('waits for both seats then resets to a fresh BIDDING game with a new seed', () => {
    const done = finishedGame()
    const one = requestRematch(done, 'P1', 0)
    expect(one.phase).toBe('GAMEOVER')
    const both = requestRematch(one, 'P2', 0)
    expect(both.phase).toBe('BIDDING')
    expect(both.round).toBe(1)
    expect(both.seats.P1!.score).toBe(0)
    expect(both.seats.P2!.score).toBe(0)
    expect(both.seats.P1!.hand.length).toBe(13)
    expect(both.seats.P1!.wantsRematch).toBe(false)
    expect(both.seed).not.toBe(done.seed)
    expect(both.seats.P1!.name).toBe('Alice')
  })

  it('rejects a rematch request before GAMEOVER', () => {
    expect(() => requestRematch(game(), 'P1', 0)).toThrowError(/WRONG_PHASE/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gameEngine.public.test.ts`
Expected: FAIL — `publicStateFor` / `requestRematch` not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/gameEngine.ts`:
```ts
import type { PublicState } from '@/lib/types'

const CONNECTED_WINDOW_MS = 8000

export function requestRematch(state: RoomState, seat: Seat, now?: number): RoomState {
  if (state.phase !== 'GAMEOVER') throw new GameError('WRONG_PHASE', 'game is not over')
  const seats = {
    ...state.seats,
    [seat]: { ...state.seats[seat]!, wantsRematch: true },
  } as RoomState['seats']
  if (seats.P1?.wantsRematch && seats.P2?.wantsRematch) {
    const reseeded: RoomState = { ...state, seats, seed: makeSeed(), phase: 'LOBBY' }
    return startGame(reseeded, now)
  }
  return { ...state, seats }
}

export function publicStateFor(
  state: RoomState,
  seat: Seat,
  now: number,
  seen: { p1: number | null; p2: number | null },
): PublicState {
  const me = state.seats[seat]!
  const oppSeat: Seat = seat === 'P1' ? 'P2' : 'P1'
  const opp = state.seats[oppSeat]
  const oppSeen = oppSeat === 'P1' ? seen.p1 : seen.p2
  const last = state.log.at(-1)

  return {
    code: state.code,
    phase: state.phase,
    tieMode: state.tieMode,
    round: state.round,
    you: {
      seat,
      name: me.name,
      hand: [...me.hand].sort((a, b) => a - b),
      spent: me.spent,
      score: me.score,
    },
    opponent: opp
      ? {
          name: opp.name,
          cardsRemaining: opp.hand.length,
          spent: opp.spent,
          score: opp.score,
          connected: oppSeen != null && now - oppSeen < CONNECTED_WINDOW_MS,
        }
      : null,
    prizeCard: state.prizeCard,
    prizesRevealed: state.prizesRevealed,
    prizesRemaining: ROUNDS - state.prizesRevealed.length,
    carry: state.carry,
    youLocked: state.bids[seat] != null,
    opponentLocked: state.bids[oppSeat] != null,
    reveal:
      state.phase === 'RESULT' && last
        ? { p1Card: last.p1Card, p2Card: last.p2Card, winner: last.winner, awarded: last.awarded }
        : null,
    log: state.log,
    finalResult: state.phase === 'GAMEOVER' ? finalResult(state) : null,
    autoAdvanceAt: state.revealedAt != null ? state.revealedAt + AUTO_ADVANCE_MS : null,
    youWantRematch: me.wantsRematch,
    opponentWantsRematch: opp?.wantsRematch ?? false,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/gameEngine.public.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/gameEngine.ts test/gameEngine.public.test.ts
git commit -m "feat: engine public projection + rematch reset

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Redis client + in-memory fake

**Files:**
- Create: `lib/redis.ts`, `test/helpers/fakeRedis.ts`
- Test: `test/fakeRedis.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `lib/redis.ts`: `export const redis` — a configured `@upstash/redis` client (`automaticDeserialization: false`).
  - `test/helpers/fakeRedis.ts`: `class FakeRedis` with `get(key)`, `set(key, value, opts?)`, `del(key)`, `expire(key, seconds)`, `reset()`; singleton `fakeRedis`; `resetFakeRedis()`. `set` opts: `{ nx?: boolean; px?: number; ex?: number }`, returns `'OK' | null` (null when `nx` and key exists).

- [ ] **Step 1: Write the failing test**

`test/fakeRedis.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { fakeRedis, resetFakeRedis } from './helpers/fakeRedis'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

describe('FakeRedis', () => {
  it('round-trips a string value', async () => {
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.get('k')).toBe('v')
  })

  it('honours nx: returns null and does not overwrite when the key exists', async () => {
    expect(await fakeRedis.set('k', 'first', { nx: true })).toBe('OK')
    expect(await fakeRedis.set('k', 'second', { nx: true })).toBeNull()
    expect(await fakeRedis.get('k')).toBe('first')
  })

  it('expires keys after px milliseconds', async () => {
    vi.useFakeTimers()
    await fakeRedis.set('k', 'v', { px: 1000 })
    vi.advanceTimersByTime(999)
    expect(await fakeRedis.get('k')).toBe('v')
    vi.advanceTimersByTime(2)
    expect(await fakeRedis.get('k')).toBeNull()
  })

  it('del removes a key and reports the count', async () => {
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.del('k')).toBe(1)
    expect(await fakeRedis.del('k')).toBe(0)
  })

  it('expire sets a TTL on an existing key only', async () => {
    expect(await fakeRedis.expire('missing', 5)).toBe(0)
    await fakeRedis.set('k', 'v')
    expect(await fakeRedis.expire('k', 5)).toBe(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/fakeRedis.test.ts`
Expected: FAIL — `./helpers/fakeRedis` missing.

- [ ] **Step 3: Write the implementation**

`lib/redis.ts`:
```ts
import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL ?? '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  automaticDeserialization: false,
})
```

`test/helpers/fakeRedis.ts`:
```ts
type Entry = { value: string; expireAt: number | null }
type SetOpts = { nx?: boolean; px?: number; ex?: number }

export class FakeRedis {
  private store = new Map<string, Entry>()

  private live(key: string): Entry | undefined {
    const e = this.store.get(key)
    if (!e) return undefined
    if (e.expireAt != null && Date.now() >= e.expireAt) {
      this.store.delete(key)
      return undefined
    }
    return e
  }

  async get<T = string>(key: string): Promise<T | null> {
    const e = this.live(key)
    return (e ? e.value : null) as T | null
  }

  async set(key: string, value: string, opts?: SetOpts): Promise<'OK' | null> {
    if (opts?.nx && this.live(key)) return null
    const ttlMs = opts?.px != null ? opts.px : opts?.ex != null ? opts.ex * 1000 : null
    this.store.set(key, { value, expireAt: ttlMs != null ? Date.now() + ttlMs : null })
    return 'OK'
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key)
    if (!e) return 0
    e.expireAt = Date.now() + seconds * 1000
    return 1
  }

  reset(): void {
    this.store.clear()
  }
}

export const fakeRedis = new FakeRedis()
export const resetFakeRedis = () => fakeRedis.reset()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/fakeRedis.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/redis.ts test/helpers/fakeRedis.ts test/fakeRedis.test.ts
git commit -m "feat: upstash client + in-memory fake redis for tests

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: rooms.ts — keys, load/save with TTL, generateCode passthrough

**Files:**
- Create: `lib/rooms.ts`
- Test: `test/rooms.store.test.ts`

**Interfaces:**
- Consumes: `lib/redis.ts` (`redis`), `lib/types.ts` (`RoomState`), `lib/rng.ts` (`generateCode`).
- Produces:
  - `const ROOM_TTL_SECONDS = 7200`
  - `roomKey(code: string): string` → `room:{CODE}` (code upper-cased)
  - `seenKey(code: string, seat: Seat): string` → `seen:{CODE}:{seat}`
  - `lockKey(code: string): string` → `lock:room:{CODE}`
  - `loadRoom(code: string): Promise<RoomState | null>`
  - `saveRoom(state: RoomState): Promise<void>` — writes `JSON.stringify(state)` with `{ ex: ROOM_TTL_SECONDS }`
  - re-export `generateCode` from `lib/rng`

- [ ] **Step 1: Write the failing test**

`test/rooms.store.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { fakeRedis, resetFakeRedis } from './helpers/fakeRedis'
import { roomKey, seenKey, lockKey, loadRoom, saveRoom, ROOM_TTL_SECONDS } from '@/lib/rooms'
import { createGame } from '@/lib/gameEngine'

beforeEach(resetFakeRedis)

describe('room keys', () => {
  it('upper-cases the code', () => {
    expect(roomKey('ab23')).toBe('room:AB23')
    expect(seenKey('ab23', 'P1')).toBe('seen:AB23:P1')
    expect(lockKey('ab23')).toBe('lock:room:AB23')
  })
})

describe('loadRoom / saveRoom', () => {
  it('round-trips a RoomState as JSON', async () => {
    const { state } = createGame({ code: 'AB23', name: 'Alice', tieMode: 'discard', seed: 's', now: 1 })
    await saveRoom(state)
    const raw = await fakeRedis.get(roomKey('AB23'))
    expect(typeof raw).toBe('string')
    const loaded = await loadRoom('ab23')
    expect(loaded).toEqual(state)
  })

  it('returns null for an unknown room', async () => {
    expect(await loadRoom('ZZZZ')).toBeNull()
  })

  it('sets the 2-hour TTL on save', async () => {
    vi.useFakeTimers()
    const { state } = createGame({ code: 'AB23', name: 'A', tieMode: 'discard', seed: 's', now: 1 })
    await saveRoom(state)
    vi.advanceTimersByTime(ROOM_TTL_SECONDS * 1000 - 10)
    expect(await loadRoom('AB23')).not.toBeNull()
    vi.advanceTimersByTime(20)
    expect(await loadRoom('AB23')).toBeNull()
    vi.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rooms.store.test.ts`
Expected: FAIL — `@/lib/rooms` missing.

- [ ] **Step 3: Write the implementation**

`lib/rooms.ts`:
```ts
import { redis } from '@/lib/redis'
import type { RoomState, Seat } from '@/lib/types'

export { generateCode } from '@/lib/rng'

export const ROOM_TTL_SECONDS = 7200

export function roomKey(code: string): string {
  return `room:${code.toUpperCase()}`
}
export function seenKey(code: string, seat: Seat): string {
  return `seen:${code.toUpperCase()}:${seat}`
}
export function lockKey(code: string): string {
  return `lock:room:${code.toUpperCase()}`
}

export async function loadRoom(code: string): Promise<RoomState | null> {
  const raw = await redis.get<string>(roomKey(code))
  if (raw == null) return null
  return typeof raw === 'string' ? (JSON.parse(raw) as RoomState) : (raw as RoomState)
}

export async function saveRoom(state: RoomState): Promise<void> {
  await redis.set(roomKey(state.code), JSON.stringify(state), { ex: ROOM_TTL_SECONDS })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/rooms.store.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rooms.ts test/rooms.store.test.ts
git commit -m "feat: room key helpers + load/save with sliding TTL

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: rooms.ts — withLock + presence

**Files:**
- Modify: `lib/rooms.ts`
- Test: `test/rooms.lock.test.ts`

**Interfaces:**
- Consumes: Task 8 exports + `lib/redis.ts`, `lib/rng.ts` (`randomId`), `lib/types.ts` (`GameError`, `Seat`).
- Produces:
  - `const LOCK_TTL_MS = 3000`
  - `withLock<T>(code: string, fn: () => Promise<T>, opts?: { retries?: number; backoffMs?: number }): Promise<T>` — acquire `lockKey` with `{ nx: true, px: LOCK_TTL_MS }`; default 8 retries × 40 ms; on failure throw `new GameError('LOCK_TIMEOUT', 'room busy')`; release in `finally`, only if the stored token is still ours.
  - `touchSeen(code: string, seat: Seat, now?: number): Promise<void>` — `redis.set(seenKey, String(now ?? Date.now()), { ex: 30 })`
  - `readSeen(code: string, seat: Seat): Promise<number | null>`

- [ ] **Step 1: Write the failing test**

`test/rooms.lock.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { withLock, touchSeen, readSeen } from '@/lib/rooms'

beforeEach(resetFakeRedis)

describe('withLock', () => {
  it('serialises overlapping callers on the same code', async () => {
    const order: string[] = []
    const a = withLock('AB23', async () => {
      order.push('a-start')
      await new Promise((r) => setTimeout(r, 30))
      order.push('a-end')
      return 'a'
    })
    const b = withLock('AB23', async () => {
      order.push('b-start')
      order.push('b-end')
      return 'b'
    })
    await Promise.all([a, b])
    expect(order).toEqual(['a-start', 'a-end', 'b-start', 'b-end'])
  })

  it('does not block a different room code', async () => {
    let bRan = false
    await withLock('AAAA', async () => {
      await withLock('BBBB', async () => {
        bRan = true
      })
    })
    expect(bRan).toBe(true)
  })

  it('throws LOCK_TIMEOUT if the lock cannot be acquired', async () => {
    await withLock('AB23', async () => {
      await expect(
        withLock('AB23', async () => 'inner', { retries: 2, backoffMs: 5 }),
      ).rejects.toThrowError(/LOCK_TIMEOUT/)
    })
  })
})

describe('presence', () => {
  it('touchSeen writes a timestamp readSeen can read back', async () => {
    await touchSeen('AB23', 'P1', 12345)
    expect(await readSeen('AB23', 'P1')).toBe(12345)
    expect(await readSeen('AB23', 'P2')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/rooms.lock.test.ts`
Expected: FAIL — `withLock` / `touchSeen` / `readSeen` not exported.

- [ ] **Step 3: Write the implementation**

Append to `lib/rooms.ts`:
```ts
import { randomId } from '@/lib/rng'
import { GameError } from '@/lib/types'

export const LOCK_TTL_MS = 3000

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function withLock<T>(
  code: string,
  fn: () => Promise<T>,
  opts?: { retries?: number; backoffMs?: number },
): Promise<T> {
  const retries = opts?.retries ?? 8
  const backoffMs = opts?.backoffMs ?? 40
  const key = lockKey(code)
  const token = randomId()

  let acquired = false
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await redis.set(key, token, { nx: true, px: LOCK_TTL_MS })
    if (res === 'OK') {
      acquired = true
      break
    }
    if (attempt < retries) await sleep(backoffMs)
  }
  if (!acquired) throw new GameError('LOCK_TIMEOUT', 'room busy, try again')

  try {
    return await fn()
  } finally {
    const current = await redis.get<string>(key)
    if (current === token) await redis.del(key)
  }
}

export async function touchSeen(code: string, seat: Seat, now?: number): Promise<void> {
  await redis.set(seenKey(code, seat), String(now ?? Date.now()), { ex: 30 })
}

export async function readSeen(code: string, seat: Seat): Promise<number | null> {
  const v = await redis.get<string>(seenKey(code, seat))
  return v == null ? null : Number(v)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/rooms.lock.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/rooms.ts test/rooms.lock.test.ts
git commit -m "feat: per-room lock + lock-free presence keys

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: API helpers + POST /api/room (create)

**Files:**
- Create: `lib/apiHelpers.ts`, `app/api/room/route.ts`
- Test: `test/api.create.test.ts`

**Interfaces:**
- Consumes: `lib/rooms.ts` (`generateCode`, `roomKey`, `saveRoom`, `ROOM_TTL_SECONDS`), `lib/gameEngine.ts` (`createGame`, `publicStateFor`), `lib/redis.ts` (`redis`), `lib/types.ts`.
- Produces:
  - `lib/apiHelpers.ts`: `ok(data: unknown, status?: number): Response`; `fail(code: ErrorCode | 'INTERNAL', message: string, status: number): Response`; `handle(fn: () => Promise<Response>): Promise<Response>` (maps `GameError` → status via the table in Global Constraints, anything else → 500 `INTERNAL`); `sanitizeName(input: unknown): string | null` (trim, collapse whitespace, strip control chars, cap 20 chars, empty → null).
  - `POST /api/room` route: body `{ name, tieMode }` → `{ code, playerId, seat: 'P1', state: PublicState }`.

- [ ] **Step 1: Write the failing test**

`test/api.create.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { loadRoom } from '@/lib/rooms'
import { POST as createRoom } from '@/app/api/room/route'

beforeEach(resetFakeRedis)

function req(body: unknown) {
  return new Request('http://test/api/room', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/room', () => {
  it('creates a LOBBY room and returns the P1 view', async () => {
    const res = await createRoom(req({ name: 'Alice', tieMode: 'carryover' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/)
    expect(json.seat).toBe('P1')
    expect(json.state.phase).toBe('LOBBY')
    expect(json.state.tieMode).toBe('carryover')
    expect(json.state.you.name).toBe('Alice')
    expect(json.state.opponent).toBeNull()

    const saved = await loadRoom(json.code)
    expect(saved?.seats.P1?.playerId).toBe(json.playerId)
  })

  it('defaults an unknown tieMode to discard and rejects a blank name', async () => {
    const ok = await createRoom(req({ name: '  Bob  ', tieMode: 'nonsense' }))
    expect((await ok.json()).state.tieMode).toBe('discard')

    const bad = await createRoom(req({ name: '   ', tieMode: 'discard' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error.code).toBe('BAD_REQUEST')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api.create.test.ts`
Expected: FAIL — route + helpers missing.

- [ ] **Step 3: Write the implementation**

`lib/apiHelpers.ts`:
```ts
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
```

`app/api/room/route.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api.create.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/apiHelpers.ts app/api/room/route.ts test/api.create.test.ts
git commit -m "feat: POST /api/room create endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: POST /api/room/[code]/join

**Files:**
- Create: `app/api/room/[code]/join/route.ts`
- Test: `test/api.join.test.ts`

**Interfaces:**
- Consumes: `lib/rooms.ts` (`withLock`, `loadRoom`, `saveRoom`, `readSeen`), `lib/gameEngine.ts` (`joinRoom`, `publicStateFor`), `lib/apiHelpers.ts`.
- Produces: `POST /api/room/[code]/join` — body `{ name?, playerId? }`, handler signature `(request: Request, ctx: { params: Promise<{ code: string }> })`. Returns `{ playerId, seat, state }`. `ROOM_NOT_FOUND` when the room is absent; `ROOM_FULL` from the engine.

- [ ] **Step 1: Write the failing test**

`test/api.join.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'

beforeEach(resetFakeRedis)

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

async function makeRoom() {
  const res = await createRoom(jsonReq('http://test/api/room', { name: 'Alice', tieMode: 'discard' }))
  return res.json() as Promise<{ code: string; playerId: string }>
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

describe('POST /api/room/[code]/join', () => {
  it('second player fills P2 and the game auto-starts', async () => {
    const { code } = await makeRoom()
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Bob' }), ctx(code))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.seat).toBe('P2')
    expect(json.state.phase).toBe('BIDDING')
    expect(json.state.you.hand).toHaveLength(13)
    expect(json.state.opponent.name).toBe('Alice')
  })

  it('reconnect with a known playerId returns the same seat', async () => {
    const { code, playerId } = await makeRoom()
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { playerId }), ctx(code))
    const json = await res.json()
    expect(json.seat).toBe('P1')
    expect(json.playerId).toBe(playerId)
  })

  it('a third stranger is rejected with ROOM_FULL', async () => {
    const { code } = await makeRoom()
    await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Bob' }), ctx(code))
    const res = await joinRoute(jsonReq(`http://test/api/room/${code}/join`, { name: 'Carol' }), ctx(code))
    expect(res.status).toBe(409)
    expect((await res.json()).error.code).toBe('ROOM_FULL')
  })

  it('joining a missing room is ROOM_NOT_FOUND', async () => {
    const res = await joinRoute(jsonReq('http://test/api/room/ZZZZ/join', { name: 'Bob' }), ctx('ZZZZ'))
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe('ROOM_NOT_FOUND')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api.join.test.ts`
Expected: FAIL — join route missing.

- [ ] **Step 3: Write the implementation**

`app/api/room/[code]/join/route.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api.join.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/room/[code]/join/route.ts" test/api.join.test.ts
git commit -m "feat: POST join/reconnect endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: POST /api/room/[code]/bid

**Files:**
- Create: `app/api/room/[code]/bid/route.ts`
- Test: `test/api.bid.test.ts`

**Interfaces:**
- Consumes: `lib/rooms.ts` (`withLock`, `loadRoom`, `saveRoom`, `readSeen`), `lib/gameEngine.ts` (`seatForPlayer`, `submitBid`, `publicStateFor`), `lib/apiHelpers.ts`.
- Produces: `POST /api/room/[code]/bid` — body `{ playerId, card }`. Returns `{ state }` (the caller's view). `UNKNOWN_PLAYER` if the id resolves to no seat; `INVALID_BID` / `WRONG_PHASE` propagate from the engine; `BAD_REQUEST` if `card` is not an integer.

- [ ] **Step 1: Write the failing test**

`test/api.bid.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { loadRoom } from '@/lib/rooms'

beforeEach(resetFakeRedis)

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

async function startedGame() {
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  return { code: c.code as string, p1: c.playerId as string, p2: j.playerId as string }
}

describe('POST /api/room/[code]/bid', () => {
  it('locks the caller and hides the value from the opponent until both are in', async () => {
    const { code, p1, p2 } = await startedGame()
    const r1 = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 10 }), ctx(code))
    const s1 = (await r1.json()).state
    expect(s1.youLocked).toBe(true)
    expect(s1.reveal).toBeNull()

    const r2 = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 4 }), ctx(code))
    const s2 = (await r2.json()).state
    expect(s2.phase).toBe('RESULT')
    expect(s2.reveal).toEqual({ p1Card: 10, p2Card: 4, winner: 'P1', awarded: expect.any(Number) })
  })

  it('rejects an unknown player and a non-integer card', async () => {
    const { code, p1 } = await startedGame()
    const stranger = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: 'nope', card: 5 }), ctx(code))
    expect(stranger.status).toBe(403)
    const bad = await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 'x' }), ctx(code))
    expect(bad.status).toBe(400)
  })

  it('resolves exactly one round when both bids land concurrently', async () => {
    const { code, p1, p2 } = await startedGame()
    await Promise.all([
      bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 7 }), ctx(code)),
      bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 8 }), ctx(code)),
    ])
    const room = await loadRoom(code)
    expect(room?.log).toHaveLength(1)
    expect(room?.phase).toBe('RESULT')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api.bid.test.ts`
Expected: FAIL — bid route missing.

- [ ] **Step 3: Write the implementation**

`app/api/room/[code]/bid/route.ts`:
```ts
import { withLock, loadRoom, saveRoom, readSeen } from '@/lib/rooms'
import { seatForPlayer, submitBid, publicStateFor } from '@/lib/gameEngine'
import { ok, handle } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const body = (await request.json().catch(() => null)) as
      | { playerId?: unknown; card?: unknown }
      | null
    const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
    const card = Number(body?.card)
    if (!playerId || !Number.isInteger(card)) {
      throw new GameError('BAD_REQUEST', 'playerId and an integer card are required')
    }

    const state = await withLock(code, async () => {
      const room = await loadRoom(code)
      if (!room) throw new GameError('ROOM_NOT_FOUND', 'room not found')
      const seat = seatForPlayer(room, playerId)
      if (!seat) throw new GameError('UNKNOWN_PLAYER', 'unknown player')
      const next = submitBid(room, seat, card, Date.now())
      await saveRoom(next)
      const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
      return publicStateFor(next, seat, Date.now(), seen)
    })
    return ok({ state })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api.bid.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/room/[code]/bid/route.ts" test/api.bid.test.ts
git commit -m "feat: POST bid endpoint with locked resolution

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: GET /api/room/[code]/state (+ lazy auto-advance)

**Files:**
- Create: `app/api/room/[code]/state/route.ts`
- Test: `test/api.state.test.ts`

**Interfaces:**
- Consumes: `lib/rooms.ts` (`loadRoom`, `saveRoom`, `withLock`, `touchSeen`, `readSeen`), `lib/gameEngine.ts` (`seatForPlayer`, `advanceRound`, `publicStateFor`, `AUTO_ADVANCE_MS`), `lib/apiHelpers.ts`.
- Produces: `GET /api/room/[code]/state?playerId=…` — returns `{ state }`. Lock-free except when it performs the auto-advance. `BAD_REQUEST` if `playerId` missing, `UNKNOWN_PLAYER` if unresolved, `ROOM_NOT_FOUND` if absent.

- [ ] **Step 1: Write the failing test**

`test/api.state.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { GET as stateRoute } from '@/app/api/room/[code]/state/route'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })
const getReq = (code: string, playerId: string) =>
  new Request(`http://t/api/room/${code}/state?playerId=${encodeURIComponent(playerId)}`)

async function startedGame() {
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  return { code: c.code as string, p1: c.playerId as string, p2: j.playerId as string }
}

describe('GET /api/room/[code]/state', () => {
  it('returns the caller per-seat view and marks the caller seen', async () => {
    const { code, p1 } = await startedGame()
    const res = await stateRoute(getReq(code, p1), ctx(code))
    expect(res.status).toBe(200)
    const s = (await res.json()).state
    expect(s.you.seat).toBe('P1')
    expect(s.phase).toBe('BIDDING')
  })

  it('403 for an unknown playerId, 404 for a missing room, 400 without playerId', async () => {
    const { code } = await startedGame()
    expect((await stateRoute(getReq(code, 'nope'), ctx(code))).status).toBe(403)
    expect((await stateRoute(getReq('ZZZZ', 'x'), ctx('ZZZZ'))).status).toBe(404)
    expect((await stateRoute(new Request(`http://t/api/room/${code}/state`), ctx(code))).status).toBe(400)
  })

  it('performs the lazy auto-advance once 3s have passed since the reveal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const { code, p1, p2 } = await startedGame()
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: 5 }), ctx(code))
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: 9 }), ctx(code))

    vi.setSystemTime(1000)
    let s = (await (await stateRoute(getReq(code, p1), ctx(code))).json()).state
    expect(s.phase).toBe('RESULT')

    vi.setSystemTime(3001)
    s = (await (await stateRoute(getReq(code, p1), ctx(code))).json()).state
    expect(s.phase).toBe('BIDDING')
    expect(s.round).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/api.state.test.ts`
Expected: FAIL — state route missing.

- [ ] **Step 3: Write the implementation**

`app/api/room/[code]/state/route.ts`:
```ts
import { loadRoom, saveRoom, withLock, touchSeen, readSeen } from '@/lib/rooms'
import { seatForPlayer, advanceRound, publicStateFor, AUTO_ADVANCE_MS } from '@/lib/gameEngine'
import { ok, handle } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'
import type { RoomState } from '@/lib/types'

function advanceDue(state: RoomState, now: number): boolean {
  return state.phase === 'RESULT' && state.revealedAt != null && now >= state.revealedAt + AUTO_ADVANCE_MS
}

export async function GET(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const playerId = new URL(request.url).searchParams.get('playerId')
    if (!playerId) throw new GameError('BAD_REQUEST', 'playerId query param is required')

    let state = await loadRoom(code)
    if (!state) throw new GameError('ROOM_NOT_FOUND', 'room not found')
    const seat = seatForPlayer(state, playerId)
    if (!seat) throw new GameError('UNKNOWN_PLAYER', 'unknown player')

    await touchSeen(code, seat, Date.now())

    if (advanceDue(state, Date.now())) {
      state = await withLock(code, async () => {
        const fresh = await loadRoom(code)
        if (!fresh) throw new GameError('ROOM_NOT_FOUND', 'room not found')
        if (!advanceDue(fresh, Date.now())) return fresh
        const advanced = advanceRound(fresh, Date.now())
        await saveRoom(advanced)
        return advanced
      })
    }

    const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
    return ok({ state: publicStateFor(state, seat, Date.now(), seen) })
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/api.state.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/room/[code]/state/route.ts" test/api.state.test.ts
git commit -m "feat: GET state endpoint with lazy auto-advance

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: POST /api/room/[code]/rematch + full scripted integration test

**Files:**
- Create: `app/api/room/[code]/rematch/route.ts`
- Test: `test/api.rematch.test.ts`, `test/api.integration.test.ts`

**Interfaces:**
- Consumes: `lib/rooms.ts` (`withLock`, `loadRoom`, `saveRoom`, `readSeen`), `lib/gameEngine.ts` (`seatForPlayer`, `requestRematch`, `publicStateFor`), `lib/apiHelpers.ts`.
- Produces: `POST /api/room/[code]/rematch` — body `{ playerId }`. Returns `{ state }`. `WRONG_PHASE` before `GAMEOVER`.

- [ ] **Step 1: Write the failing tests**

`test/api.rematch.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { GET as stateRoute } from '@/app/api/room/[code]/state/route'
import { POST as rematchRoute } from '@/app/api/room/[code]/rematch/route'

beforeEach(resetFakeRedis)

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })

async function playToGameOver() {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
  const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
  const code = c.code as string
  const p1 = c.playerId as string
  const p2 = j.playerId as string
  const P1 = [13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
  const P2 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]
  let t = 0
  for (let i = 0; i < 13; i++) {
    t += 10
    vi.setSystemTime(t)
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: P1[i] }), ctx(code))
    await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: P2[i] }), ctx(code))
    t += 3001
    vi.setSystemTime(t)
    await stateRoute(new Request(`http://t/api/room/${code}/state?playerId=${p1}`), ctx(code))
  }
  vi.useRealTimers()
  return { code, p1, p2 }
}

describe('POST /api/room/[code]/rematch', () => {
  it('resets to a fresh game only after both players accept', async () => {
    const { code, p1, p2 } = await playToGameOver()
    const one = (await (await rematchRoute(jsonReq(`http://t/api/room/${code}/rematch`, { playerId: p1 }), ctx(code))).json()).state
    expect(one.phase).toBe('GAMEOVER')
    expect(one.youWantRematch).toBe(true)

    const two = (await (await rematchRoute(jsonReq(`http://t/api/room/${code}/rematch`, { playerId: p2 }), ctx(code))).json()).state
    expect(two.phase).toBe('BIDDING')
    expect(two.round).toBe(1)
    expect(two.you.score).toBe(0)
    expect(two.you.hand).toHaveLength(13)
  })

  it('rejects a rematch before the game is over', async () => {
    const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
    await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))
    const res = await rematchRoute(jsonReq(`http://t/api/room/${c.code}/rematch`, { playerId: c.playerId }), ctx(c.code))
    expect(res.status).toBe(409)
  })
})
```

`test/api.integration.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@/lib/redis', async () => {
  const { fakeRedis } = await import('./helpers/fakeRedis')
  return { redis: fakeRedis }
})

import { resetFakeRedis } from './helpers/fakeRedis'
import { POST as createRoom } from '@/app/api/room/route'
import { POST as joinRoute } from '@/app/api/room/[code]/join/route'
import { POST as bidRoute } from '@/app/api/room/[code]/bid/route'
import { GET as stateRoute } from '@/app/api/room/[code]/state/route'

beforeEach(resetFakeRedis)
afterEach(() => vi.useRealTimers())

const jsonReq = (url: string, body: unknown) =>
  new Request(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
const ctx = (code: string) => ({ params: Promise.resolve({ code }) })
const view = async (code: string, pid: string) =>
  (await (await stateRoute(new Request(`http://t/api/room/${code}/state?playerId=${pid}`), ctx(code))).json()).state

describe('full game via the HTTP handlers', () => {
  it('plays 13 rounds to a GAMEOVER whose scores sum to 91', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const c = await (await createRoom(jsonReq('http://t/api/room', { name: 'Alice', tieMode: 'discard' }))).json()
    const j = await (await joinRoute(jsonReq(`http://t/api/room/${c.code}/join`, { name: 'Bob' }), ctx(c.code))).json()
    const { code } = c
    const p1: string = c.playerId
    const p2: string = j.playerId

    let clock = 0
    for (let round = 1; round <= 13; round++) {
      const before = await view(code, p1)
      expect(before.phase).toBe('BIDDING')
      expect(before.round).toBe(round)
      // P1 bids high, P2 bids low, rotating so cards are unique each round
      const p1Card = before.you.hand[before.you.hand.length - 1]
      const p2View = await view(code, p2)
      const p2Card = p2View.you.hand[0]
      clock += 10
      vi.setSystemTime(clock)
      await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p1, card: p1Card }), ctx(code))
      const afterBid = await view(code, p2)
      await bidRoute(jsonReq(`http://t/api/room/${code}/bid`, { playerId: p2, card: p2Card }), ctx(code))
      const result = await view(code, p1)
      expect(result.phase).toBe('RESULT')
      expect(result.reveal).not.toBeNull()
      clock += 3001
      vi.setSystemTime(clock)
      await view(code, p1) // triggers auto-advance
    }

    const final = await view(code, p1)
    expect(final.phase).toBe('GAMEOVER')
    expect(final.finalResult!.p1 + final.finalResult!.p2).toBe(91)
    expect(final.log).toHaveLength(13)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/api.rematch.test.ts test/api.integration.test.ts`
Expected: FAIL — rematch route missing (rematch file) / assertion errors (integration relies on rematch route import? no — integration does not; it should fail only if any earlier route regressed. If integration passes already, that's fine — keep it as a guard).

- [ ] **Step 3: Write the implementation**

`app/api/room/[code]/rematch/route.ts`:
```ts
import { withLock, loadRoom, saveRoom, readSeen } from '@/lib/rooms'
import { seatForPlayer, requestRematch, publicStateFor } from '@/lib/gameEngine'
import { ok, handle } from '@/lib/apiHelpers'
import { GameError } from '@/lib/types'

export async function POST(
  request: Request,
  ctx: { params: Promise<{ code: string }> },
): Promise<Response> {
  return handle(async () => {
    const { code } = await ctx.params
    const body = (await request.json().catch(() => null)) as { playerId?: unknown } | null
    const playerId = typeof body?.playerId === 'string' ? body.playerId : ''
    if (!playerId) throw new GameError('BAD_REQUEST', 'playerId is required')

    const state = await withLock(code, async () => {
      const room = await loadRoom(code)
      if (!room) throw new GameError('ROOM_NOT_FOUND', 'room not found')
      const seat = seatForPlayer(room, playerId)
      if (!seat) throw new GameError('UNKNOWN_PLAYER', 'unknown player')
      const next = requestRematch(room, seat, Date.now())
      await saveRoom(next)
      const seen = { p1: await readSeen(code, 'P1'), p2: await readSeen(code, 'P2') }
      return publicStateFor(next, seat, Date.now(), seen)
    })
    return ok({ state })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — the whole suite is green.

- [ ] **Step 5: Commit**

```bash
git add "app/api/room/[code]/rematch/route.ts" test/api.rematch.test.ts test/api.integration.test.ts
git commit -m "feat: POST rematch endpoint + full HTTP integration test

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Client polling hook — useRoomState

**Files:**
- Create: `hooks/useRoomState.ts`
- Test: `test/useRoomState.test.tsx`

**Interfaces:**
- Consumes: `lib/types.ts` (`PublicState`).
- Produces:
  - `useRoomState(code: string, playerId: string | null): { state: PublicState | null; error: { code: string; message: string } | null; actions: { bid: (card: number) => Promise<void>; rematch: () => Promise<void> } }`
  - `const POLL_INTERVALS: Record<Phase | 'default', number>` = `{ RESULT: 600, BIDDING: 1200, LOBBY: 2500, GAMEOVER: 2500, default: 1500 }`
  - Polls `GET /api/room/{code}/state?playerId=…`; interval from `POLL_INTERVALS[state.phase] ?? default`; pauses when `document.visibilityState === 'hidden'`; polls once immediately on `visibilitychange` → visible. `actions.*` POST to `/api/room/{code}/{bid|rematch}` with `{ playerId, ...payload }` then set state from the response.

- [ ] **Step 1: Write the failing test**

`test/useRoomState.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useRoomState, POLL_INTERVALS } from '@/hooks/useRoomState'

function jsonResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) } as Response)
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useRoomState', () => {
  it('fetches state on mount and exposes it', async () => {
    const fetchMock = vi.fn().mockReturnValue(
      jsonResponse({ state: { phase: 'BIDDING', round: 1 } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useRoomState('AB23', 'p1'))
    await act(async () => { await Promise.resolve() })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/room/AB23/state?playerId=p1'))
    await waitFor(() => expect(result.current.state?.phase).toBe('BIDDING'))
  })

  it('re-polls on the phase-appropriate interval', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ state: { phase: 'BIDDING', round: 1 } }))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useRoomState('AB23', 'p1'))
    await act(async () => { await Promise.resolve() })
    const callsAfterMount = fetchMock.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(POLL_INTERVALS.BIDDING + 5); await Promise.resolve() })
    expect(fetchMock.mock.calls.length).toBe(callsAfterMount + 1)
  })

  it('does not poll while playerId is null', async () => {
    const fetchMock = vi.fn().mockReturnValue(jsonResponse({ state: {} }))
    vi.stubGlobal('fetch', fetchMock)
    renderHook(() => useRoomState('AB23', null))
    await act(async () => { vi.advanceTimersByTime(5000); await Promise.resolve() })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('actions.bid POSTs the card and adopts the returned state', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ state: { phase: 'RESULT', round: 1 } })
      return jsonResponse({ state: { phase: 'BIDDING', round: 1 } })
    })
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRoomState('AB23', 'p1'))
    await act(async () => { await result.current.actions.bid(7) })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/room/AB23/bid',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ playerId: 'p1', card: 7 }) }),
    )
    await waitFor(() => expect(result.current.state?.phase).toBe('RESULT'))
  })

  it('surfaces an API error body', async () => {
    const fetchMock = vi.fn().mockReturnValue(
      jsonResponse({ error: { code: 'ROOM_NOT_FOUND', message: 'gone' } }, false, 404),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = renderHook(() => useRoomState('AB23', 'p1'))
    await waitFor(() => expect(result.current.error?.code).toBe('ROOM_NOT_FOUND'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/useRoomState.test.tsx`
Expected: FAIL — `@/hooks/useRoomState` missing.

- [ ] **Step 3: Write the implementation**

`hooks/useRoomState.ts`:
```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/useRoomState.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add hooks/useRoomState.ts test/useRoomState.test.tsx
git commit -m "feat: adaptive visibility-aware polling hook

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Home page + NameGate + room shell (identity flow)

**Files:**
- Create: `components/Home.tsx`, `components/NameGate.tsx`, `app/r/[code]/page.tsx`
- Modify: `app/page.tsx`
- Test: `test/home.test.tsx`, `test/roomShell.test.tsx`

**Interfaces:**
- Consumes: `next/navigation` (`useRouter`, `useParams`), `hooks/useRoomState.ts`, `components/GameBoard.tsx` (created in Task 18 — until then the shell renders a `<pre>` dump of `state`; Task 18 swaps in `<GameBoard />`).
- Produces:
  - `Home` (client): name input + `tieMode` radio (`discard` default / `carryover`) + "Create room" → `POST /api/room` → `localStorage.setItem('gops:'+code, playerId)` → `router.push('/r/'+code)`. Plus "Join by code" text input → `router.push('/r/'+code.toUpperCase())`.
  - `NameGate` (client): `({ onSubmit }: { onSubmit: (name: string) => void })` — single text field + submit.
  - `app/r/[code]/page.tsx` (client): resolves `code` via `useParams`; reads `localStorage['gops:'+code]`. If present → `POST /api/room/{code}/join` with `{ playerId }`, keep returned `playerId`. If absent → render `<NameGate onSubmit={joinWithName} />`; on submit `POST join` with `{ name }`, then `localStorage.setItem`. Once `playerId` is known, call `useRoomState(code, playerId)` and render the board (Task 18) / a temporary `<pre>`.
  - `localStorage` key format: `gops:{CODE}` (code upper-cased).

- [ ] **Step 1: Write the failing tests**

`test/home.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

import { Home } from '@/components/Home'

beforeEach(() => {
  push.mockClear()
  localStorage.clear()
})
afterEach(() => vi.restoreAllMocks())

describe('Home', () => {
  it('creates a room, stores the token, and navigates to it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ code: 'AB23', playerId: 'p1', seat: 'P1', state: {} }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    render(<Home />)
    await userEvent.type(screen.getByLabelText(/your name/i), 'Alice')
    await userEvent.click(screen.getByRole('radio', { name: /carry/i }))
    await userEvent.click(screen.getByRole('button', { name: /create room/i }))

    expect(fetchMock).toHaveBeenCalledWith('/api/room', expect.objectContaining({ method: 'POST' }))
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(sent).toEqual({ name: 'Alice', tieMode: 'carryover' })
    expect(localStorage.getItem('gops:AB23')).toBe('p1')
    expect(push).toHaveBeenCalledWith('/r/AB23')
  })

  it('join-by-code navigates to the upper-cased room route', async () => {
    render(<Home />)
    await userEvent.type(screen.getByLabelText(/room code/i), 'ab23')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))
    expect(push).toHaveBeenCalledWith('/r/AB23')
  })
})
```

`test/roomShell.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useParams: () => ({ code: 'AB23' }), useRouter: () => ({ push: vi.fn() }) }))

import RoomPage from '@/app/r/[code]/page'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('room shell', () => {
  it('with no stored token, shows the NameGate and joins on submit', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ playerId: 'p2', seat: 'P2', state: { phase: 'BIDDING', round: 1, you: { seat: 'P2', name: 'Bob', hand: [], spent: [], score: 0 }, opponent: null, log: [] } }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    render(<RoomPage />)
    await userEvent.type(screen.getByLabelText(/name/i), 'Bob')
    await userEvent.click(screen.getByRole('button', { name: /join/i }))

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/api/room/AB23/join', expect.objectContaining({ method: 'POST' })),
    )
    expect(localStorage.getItem('gops:AB23')).toBe('p2')
  })

  it('with a stored token, reconnects without showing the NameGate', async () => {
    localStorage.setItem('gops:AB23', 'p1')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ playerId: 'p1', seat: 'P1', state: { phase: 'LOBBY', round: 1, you: { seat: 'P1', name: 'Alice', hand: [], spent: [], score: 0 }, opponent: null, log: [] } }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)

    render(<RoomPage />)
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/room/AB23/join',
        expect.objectContaining({ body: JSON.stringify({ playerId: 'p1' }) }),
      ),
    )
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/home.test.tsx test/roomShell.test.tsx`
Expected: FAIL — components missing.

- [ ] **Step 3: Write the implementation**

`components/Home.tsx`:
```tsx
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
```

`app/page.tsx` (replace placeholder):
```tsx
import { Home } from '@/components/Home'

export default function HomePage() {
  return <Home />
}
```

`components/NameGate.tsx`:
```tsx
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
```

`app/r/[code]/page.tsx`:
```tsx
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { NameGate } from '@/components/NameGate'
import { useRoomState } from '@/hooks/useRoomState'
import { GameBoard } from '@/components/GameBoard'

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
      <main className="home">
        <p role="alert" className="error">{joinError}</p>
        <a href="/">Back to home</a>
      </main>
    )
  if (!room.state) return <main className="home"><p>Loading room {code}…</p></main>
  return <GameBoard state={room.state} error={room.error} actions={room.actions} code={code} />
}
```

> Note for the implementer: `GameBoard` does not exist until Task 18. To keep this task's tests green in isolation, temporarily replace the final `return` with `return <pre>{JSON.stringify(room.state, null, 2)}</pre>` and remove the `GameBoard` import; Task 18 restores them. The `roomShell.test.tsx` assertions only check the join flow and NameGate visibility, so the placeholder is sufficient.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/home.test.tsx test/roomShell.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Home.tsx components/NameGate.tsx "app/r/[code]/page.tsx" app/page.tsx test/home.test.tsx test/roomShell.test.tsx
git commit -m "feat: home page, name gate, room identity flow

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Presentational components

**Files:**
- Create: `components/PrizePile.tsx`, `components/Hand.tsx`, `components/Scoreboard.tsx`, `components/RevealPanel.tsx`, `components/RoundLog.tsx`, `components/StatusBanner.tsx`
- Test: `test/components.test.tsx`

**Interfaces:**
- Consumes: `lib/types.ts` (`PublicState`, `LogEntry`, `Seat`).
- Produces (all named exports, all pure/presentational, no data fetching):
  - `PrizePile({ prizeCard, prizesRemaining, carry }: { prizeCard: number | null; prizesRemaining: number; carry: number })`
  - `Hand({ hand, disabled, onPick }: { hand: number[]; disabled: boolean; onPick: (card: number) => void })`
  - `Scoreboard({ you, opponent, round }: { you: PublicState['you']; opponent: PublicState['opponent']; round: number })`
  - `RevealPanel({ reveal, youSeat, autoAdvanceAt, now }: { reveal: NonNullable<PublicState['reveal']>; youSeat: Seat; autoAdvanceAt: number | null; now: number })`
  - `RoundLog({ log, youSeat }: { log: LogEntry[]; youSeat: Seat })`
  - `StatusBanner({ message }: { message: string | null })` — renders nothing when `message` is null, else a `role="status"` bar.

- [ ] **Step 1: Write the failing test**

`test/components.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PrizePile } from '@/components/PrizePile'
import { Hand } from '@/components/Hand'
import { Scoreboard } from '@/components/Scoreboard'
import { RevealPanel } from '@/components/RevealPanel'
import { RoundLog } from '@/components/RoundLog'
import { StatusBanner } from '@/components/StatusBanner'

describe('PrizePile', () => {
  it('shows the current prize, remaining count, and carry badge when carry > 0', () => {
    render(<PrizePile prizeCard={9} prizesRemaining={7} carry={4} />)
    expect(screen.getByTestId('prize-card')).toHaveTextContent('9')
    expect(screen.getByText(/7 left/i)).toBeInTheDocument()
    expect(screen.getByText(/\+4 carried/i)).toBeInTheDocument()
  })
  it('hides the carry badge when carry is 0', () => {
    render(<PrizePile prizeCard={9} prizesRemaining={7} carry={0} />)
    expect(screen.queryByText(/carried/i)).not.toBeInTheDocument()
  })
})

describe('Hand', () => {
  it('renders a button per card and fires onPick when enabled', async () => {
    const onPick = vi.fn()
    render(<Hand hand={[1, 5, 13]} disabled={false} onPick={onPick} />)
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    expect(onPick).toHaveBeenCalledWith(5)
  })
  it('disables every card when disabled', () => {
    render(<Hand hand={[1, 5, 13]} disabled onPick={() => {}} />)
    screen.getAllByRole('button').forEach((b) => expect(b).toBeDisabled())
  })
})

describe('Scoreboard', () => {
  it('shows both names, scores and the round counter', () => {
    render(
      <Scoreboard
        round={4}
        you={{ seat: 'P1', name: 'Alice', hand: [], spent: [], score: 21 }}
        opponent={{ name: 'Bob', cardsRemaining: 9, spent: [], score: 17, connected: true }}
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('21')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByText('17')).toBeInTheDocument()
    expect(screen.getByText(/round 4 \/ 13/i)).toBeInTheDocument()
  })
})

describe('RevealPanel', () => {
  it('shows both cards and names the winner', () => {
    render(
      <RevealPanel
        reveal={{ p1Card: 10, p2Card: 3, winner: 'P1', awarded: 9 }}
        youSeat="P2"
        autoAdvanceAt={5000}
        now={3000}
      />,
    )
    expect(screen.getByTestId('reveal-p1')).toHaveTextContent('10')
    expect(screen.getByTestId('reveal-p2')).toHaveTextContent('3')
    expect(screen.getByText(/you lose/i)).toBeInTheDocument()
    expect(screen.getByText(/next round in 2s/i)).toBeInTheDocument()
  })
  it('says "tie" and "next round" without a countdown when autoAdvanceAt is null', () => {
    render(
      <RevealPanel reveal={{ p1Card: 7, p2Card: 7, winner: 'TIE', awarded: 0 }} youSeat="P1" autoAdvanceAt={null} now={0} />,
    )
    expect(screen.getByText(/tie/i)).toBeInTheDocument()
  })
})

describe('RoundLog', () => {
  it('renders one row per entry with prize, both bids and outcome', () => {
    render(
      <RoundLog
        youSeat="P1"
        log={[
          { round: 1, prize: 9, carryApplied: 0, p1Card: 10, p2Card: 3, winner: 'P1', awarded: 9 },
          { round: 2, prize: 4, carryApplied: 0, p1Card: 2, p2Card: 8, winner: 'P2', awarded: 4 },
        ]}
      />,
    )
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
    expect(screen.getByText(/you won/i)).toBeInTheDocument()
    expect(screen.getByText(/you lost/i)).toBeInTheDocument()
  })
})

describe('StatusBanner', () => {
  it('renders nothing when message is null', () => {
    const { container } = render(<StatusBanner message={null} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders a status role with the message', () => {
    render(<StatusBanner message="Waiting for opponent…" />)
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for opponent…')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/components.test.tsx`
Expected: FAIL — components missing.

- [ ] **Step 3: Write the implementation**

`components/PrizePile.tsx`:
```tsx
export function PrizePile({
  prizeCard,
  prizesRemaining,
  carry,
}: {
  prizeCard: number | null
  prizesRemaining: number
  carry: number
}) {
  return (
    <section className="prize-pile" aria-label="Prize">
      <div className="prize-deck" aria-hidden>{prizesRemaining} left</div>
      <div className="prize-card" data-testid="prize-card">{prizeCard ?? '—'}</div>
      {carry > 0 && <div className="carry-badge">+{carry} carried</div>}
      <p className="prize-remaining">{prizesRemaining} left</p>
    </section>
  )
}
```

`components/Hand.tsx`:
```tsx
export function Hand({
  hand,
  disabled,
  onPick,
}: {
  hand: number[]
  disabled: boolean
  onPick: (card: number) => void
}) {
  return (
    <section className="hand" aria-label="Your hand">
      {hand.map((card) => (
        <button
          key={card}
          className="card-btn"
          disabled={disabled}
          onClick={() => onPick(card)}
        >
          {card}
        </button>
      ))}
    </section>
  )
}
```

`components/Scoreboard.tsx`:
```tsx
import type { PublicState } from '@/lib/types'

export function Scoreboard({
  you,
  opponent,
  round,
}: {
  you: PublicState['you']
  opponent: PublicState['opponent']
  round: number
}) {
  return (
    <section className="scoreboard" aria-label="Score">
      <div className="score you">
        <span className="score-name">{you.name}</span>
        <span className="score-value">{you.score}</span>
      </div>
      <div className="round-counter">Round {round} / 13</div>
      <div className="score opp">
        <span className="score-name">{opponent?.name ?? 'Waiting…'}</span>
        <span className="score-value">{opponent?.score ?? 0}</span>
      </div>
    </section>
  )
}
```

`components/RevealPanel.tsx`:
```tsx
import type { PublicState, Seat } from '@/lib/types'

export function RevealPanel({
  reveal,
  youSeat,
  autoAdvanceAt,
  now,
}: {
  reveal: NonNullable<PublicState['reveal']>
  youSeat: Seat
  autoAdvanceAt: number | null
  now: number
}) {
  const youWon = reveal.winner === youSeat
  const outcome =
    reveal.winner === 'TIE' ? 'Tie — prize pushed' : youWon ? 'You win' : 'You lose'
  const secs = autoAdvanceAt ? Math.max(0, Math.ceil((autoAdvanceAt - now) / 1000)) : null

  return (
    <section className="reveal" aria-label="Round result">
      <div className="reveal-cards">
        <span className="reveal-card" data-testid="reveal-p1">{reveal.p1Card}</span>
        <span className="reveal-vs">vs</span>
        <span className="reveal-card" data-testid="reveal-p2">{reveal.p2Card}</span>
      </div>
      <p className="reveal-outcome">{outcome}{reveal.awarded > 0 ? ` +${reveal.awarded}` : ''}</p>
      <p className="reveal-next">{secs == null ? 'Next round…' : `Next round in ${secs}s`}</p>
    </section>
  )
}
```

`components/RoundLog.tsx`:
```tsx
import type { LogEntry, Seat } from '@/lib/types'

export function RoundLog({ log, youSeat }: { log: LogEntry[]; youSeat: Seat }) {
  return (
    <section className="round-log" aria-label="Round history">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Prize</th>
            <th>You</th>
            <th>Opp</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {log.map((e) => {
            const mine = youSeat === 'P1' ? e.p1Card : e.p2Card
            const theirs = youSeat === 'P1' ? e.p2Card : e.p1Card
            const result =
              e.winner === 'TIE' ? 'Tie' : e.winner === youSeat ? `You won +${e.awarded}` : `You lost`
            return (
              <tr key={e.round}>
                <td>{e.round}</td>
                <td>{e.prize}{e.carryApplied ? ` (+${e.carryApplied})` : ''}</td>
                <td>{mine}</td>
                <td>{theirs}</td>
                <td>{result}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
```

`components/StatusBanner.tsx`:
```tsx
export function StatusBanner({ message }: { message: string | null }) {
  if (!message) return null
  return <div className="status-banner" role="status">{message}</div>
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/components.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/PrizePile.tsx components/Hand.tsx components/Scoreboard.tsx components/RevealPanel.tsx components/RoundLog.tsx components/StatusBanner.tsx test/components.test.tsx
git commit -m "feat: presentational game components

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: GameBoard + EndScreen (composition + phase switch)

**Files:**
- Create: `components/GameBoard.tsx`, `components/EndScreen.tsx`
- Modify: `app/r/[code]/page.tsx` (restore the real `GameBoard` import + render from Task 16's note)
- Test: `test/gameBoard.test.tsx`

**Interfaces:**
- Consumes: Task 15 hook return shape, Task 17 components, `lib/types.ts` (`PublicState`).
- Produces:
  - `GameBoard({ state, error, actions, code }: { state: PublicState; error: { code: string; message: string } | null; actions: { bid: (card: number) => Promise<void>; rematch: () => Promise<void> }; code: string })`
    - `LOBBY` → share panel: shows `code`, a copy-link button (`navigator.clipboard.writeText(location.href)`), "Waiting for opponent to join…".
    - `BIDDING` → `Scoreboard` + `PrizePile` + `StatusBanner` (message: `youLocked && !opponentLocked` → "Waiting for opponent's bid…"; `!opponent?.connected` → "Opponent disconnected — waiting to reconnect…"; `error` → its message; else null) + `Hand` (`disabled = youLocked || !opponent`) wired to `actions.bid` + `RoundLog`.
    - `RESULT` → same as `BIDDING` but `Hand` disabled and `RevealPanel` shown above the hand; `now` from `Date.now()` at render.
    - `GAMEOVER` → `EndScreen`.
  - `EndScreen({ state, onRematch }: { state: PublicState; onRematch: () => void })` — `finalResult` headline ("You win!" / "You lose" / "Draw" from `state.you.seat` vs `state.finalResult.winner`), final scores, full `RoundLog`, a "Rematch" button (disabled once `state.youWantRematch`), and "Waiting for opponent to accept…" when `youWantRematch && !opponentWantsRematch`.

- [ ] **Step 1: Write the failing test**

`test/gameBoard.test.tsx`:
```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GameBoard } from '@/components/GameBoard'
import type { PublicState } from '@/lib/types'

const base: PublicState = {
  code: 'AB23',
  phase: 'BIDDING',
  tieMode: 'discard',
  round: 1,
  you: { seat: 'P1', name: 'Alice', hand: [1, 2, 3, 12, 13], spent: [], score: 0 },
  opponent: { name: 'Bob', cardsRemaining: 5, spent: [], score: 0, connected: true },
  prizeCard: 7,
  prizesRevealed: [7],
  prizesRemaining: 12,
  carry: 0,
  youLocked: false,
  opponentLocked: false,
  reveal: null,
  log: [],
  finalResult: null,
  autoAdvanceAt: null,
  youWantRematch: false,
  opponentWantsRematch: false,
}
const actions = { bid: vi.fn(), rematch: vi.fn() }

describe('GameBoard', () => {
  it('LOBBY: shows the room code and a copy-link control', () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={{ ...base, phase: 'LOBBY', opponent: null }} />)
    expect(screen.getByText('AB23')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument()
  })

  it('BIDDING: clicking a card calls actions.bid', async () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={base} />)
    await userEvent.click(screen.getByRole('button', { name: '12' }))
    expect(actions.bid).toHaveBeenCalledWith(12)
  })

  it('BIDDING: after locking, the hand is disabled and a waiting banner shows', () => {
    render(<GameBoard code="AB23" error={null} actions={actions} state={{ ...base, youLocked: true }} />)
    expect(screen.getByRole('button', { name: '12' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(/waiting for opponent/i)
  })

  it('BIDDING: a disconnected opponent shows the reconnect banner', () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, opponent: { ...base.opponent!, connected: false } }} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent(/disconnected/i)
  })

  it('RESULT: shows the reveal panel', () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, phase: 'RESULT', reveal: { p1Card: 13, p2Card: 2, winner: 'P1', awarded: 7 }, log: [{ round: 1, prize: 7, carryApplied: 0, p1Card: 13, p2Card: 2, winner: 'P1', awarded: 7 }] }} />,
    )
    expect(screen.getByLabelText(/round result/i)).toBeInTheDocument()
  })

  it('GAMEOVER: headline + rematch button that calls actions.rematch', async () => {
    render(
      <GameBoard code="AB23" error={null} actions={actions}
        state={{ ...base, phase: 'GAMEOVER', finalResult: { p1: 50, p2: 41, winner: 'P1' } }} />,
    )
    expect(screen.getByText(/you win/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /rematch/i }))
    expect(actions.rematch).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/gameBoard.test.tsx`
Expected: FAIL — `GameBoard` / `EndScreen` missing.

- [ ] **Step 3: Write the implementation**

`components/EndScreen.tsx`:
```tsx
import type { PublicState } from '@/lib/types'
import { RoundLog } from '@/components/RoundLog'

export function EndScreen({ state, onRematch }: { state: PublicState; onRematch: () => void }) {
  const fr = state.finalResult!
  const headline =
    fr.winner === 'DRAW' ? 'Draw' : fr.winner === state.you.seat ? 'You win!' : 'You lose'
  const youScore = state.you.seat === 'P1' ? fr.p1 : fr.p2
  const oppScore = state.you.seat === 'P1' ? fr.p2 : fr.p1

  return (
    <main className="endscreen">
      <h1>{headline}</h1>
      <p className="final-score">
        {state.you.name} {youScore} — {oppScore} {state.opponent?.name ?? 'Opponent'}
      </p>
      <button onClick={onRematch} disabled={state.youWantRematch}>Rematch</button>
      {state.youWantRematch && !state.opponentWantsRematch && (
        <p role="status">Waiting for opponent to accept…</p>
      )}
      <RoundLog log={state.log} youSeat={state.you.seat} />
      <a href="/">Leave</a>
    </main>
  )
}
```

`components/GameBoard.tsx`:
```tsx
'use client'

import { useState } from 'react'
import type { PublicState } from '@/lib/types'
import { PrizePile } from '@/components/PrizePile'
import { Hand } from '@/components/Hand'
import { Scoreboard } from '@/components/Scoreboard'
import { RevealPanel } from '@/components/RevealPanel'
import { RoundLog } from '@/components/RoundLog'
import { StatusBanner } from '@/components/StatusBanner'
import { EndScreen } from '@/components/EndScreen'

type Actions = { bid: (card: number) => Promise<void>; rematch: () => Promise<void> }

function bannerMessage(state: PublicState, error: { message: string } | null): string | null {
  if (error) return error.message
  if (state.opponent && !state.opponent.connected)
    return 'Opponent disconnected — waiting to reconnect…'
  if (state.phase === 'BIDDING' && state.youLocked && !state.opponentLocked)
    return "Waiting for opponent's bid…"
  return null
}

export function GameBoard({
  state,
  error,
  actions,
  code,
}: {
  state: PublicState
  error: { code: string; message: string } | null
  actions: Actions
  code: string
}) {
  const [copied, setCopied] = useState(false)

  if (state.phase === 'LOBBY') {
    return (
      <main className="board lobby">
        <h1>Room <span className="code">{code}</span></h1>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href)
              setCopied(true)
            } catch {
              setCopied(false)
            }
          }}
        >
          {copied ? 'Link copied' : 'Copy invite link'}
        </button>
        <p role="status">Waiting for opponent to join…</p>
      </main>
    )
  }

  if (state.phase === 'GAMEOVER') {
    return <EndScreen state={state} onRematch={actions.rematch} />
  }

  const handDisabled = state.phase !== 'BIDDING' || state.youLocked || !state.opponent

  return (
    <main className="board">
      <Scoreboard you={state.you} opponent={state.opponent} round={state.round} />
      <PrizePile prizeCard={state.prizeCard} prizesRemaining={state.prizesRemaining} carry={state.carry} />
      {state.phase === 'RESULT' && state.reveal && (
        <RevealPanel
          reveal={state.reveal}
          youSeat={state.you.seat}
          autoAdvanceAt={state.autoAdvanceAt}
          now={Date.now()}
        />
      )}
      <StatusBanner message={bannerMessage(state, error)} />
      <Hand hand={state.you.hand} disabled={handDisabled} onPick={(card) => void actions.bid(card)} />
      <RoundLog log={state.log} youSeat={state.you.seat} />
    </main>
  )
}
```

Then in `app/r/[code]/page.tsx`, restore the real board (undo the Task 16 placeholder note): ensure `import { GameBoard } from '@/components/GameBoard'` is present and the final return is `return <GameBoard state={room.state} error={room.error} actions={room.actions} code={code} />`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run && npm run typecheck`
Expected: PASS — whole suite green.

- [ ] **Step 5: Commit**

```bash
git add components/GameBoard.tsx components/EndScreen.tsx "app/r/[code]/page.tsx" test/gameBoard.test.tsx
git commit -m "feat: GameBoard phase switch + EndScreen

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 19: Styling, reveal transition, README + deploy docs, manual QA

**Files:**
- Modify: `app/globals.css`
- Create: `README.md`
- Test: `test/build.test.ts` (guards that the production build compiles)

**Interfaces:**
- Consumes: everything.
- Produces: finished `app/globals.css` (light/dark via `prefers-color-scheme`, card styling, a `.reveal-card` flip transition), `README.md` with local + Vercel instructions, and a passing `next build`.

- [ ] **Step 1: Write the failing test**

`test/build.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'

describe('production build', () => {
  it('next build completes', () => {
    // Upstash env not required at build time; provide empty values so the client constructs.
    const out = execSync('npx next build', {
      encoding: 'utf8',
      env: { ...process.env, UPSTASH_REDIS_REST_URL: 'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'x' },
    })
    expect(out).toMatch(/Compiled successfully|Route \(app\)/)
  }, 180_000)
})
```

- [ ] **Step 2: Run test to verify it fails (or is red for the right reason)**

Run: `npx vitest run test/build.test.ts`
Expected: FAIL if any route/component has a type or lint-blocking error; otherwise it may pass. If it passes immediately, still complete Steps 3–4 (styling + README) before committing.

- [ ] **Step 3: Write the styling + docs**

`app/globals.css` (replace the stub):
```css
:root {
  color-scheme: light dark;
  --bg: #f6f6f4;
  --panel: #ffffff;
  --ink: #1a1a1a;
  --muted: #6b7280;
  --accent: #2563eb;
  --win: #16a34a;
  --lose: #dc2626;
  --border: #e5e7eb;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14161a;
    --panel: #1e2127;
    --ink: #f3f4f6;
    --muted: #9ca3af;
    --accent: #60a5fa;
    --border: #2c313a;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  background: var(--bg);
  color: var(--ink);
}
main.home, main.board, main.endscreen {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
h1 { margin: 0; font-size: 1.6rem; }
.tagline { color: var(--muted); margin: 0; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; }
.card input[type='text'], .card input:not([type]) {
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--ink); font: inherit;
}
button {
  padding: 10px 14px; border: 0; border-radius: 8px; font: inherit; font-weight: 600;
  background: var(--accent); color: #fff; cursor: pointer;
}
button:disabled { opacity: 0.5; cursor: default; }
.error { color: var(--lose); }

.scoreboard { display: flex; justify-content: space-between; align-items: center;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; }
.score { display: flex; flex-direction: column; align-items: center; min-width: 96px; }
.score-name { color: var(--muted); font-size: 0.85rem; }
.score-value { font-size: 1.5rem; font-weight: 700; }
.round-counter { color: var(--muted); }

.prize-pile { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.prize-card {
  width: 96px; height: 132px; display: grid; place-items: center;
  font-size: 2.6rem; font-weight: 700;
  background: var(--panel); border: 2px solid var(--accent); border-radius: 14px;
}
.carry-badge { color: var(--win); font-weight: 700; }
.prize-remaining, .prize-deck { color: var(--muted); font-size: 0.85rem; }
.prize-deck { display: none; }

.hand { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.card-btn {
  width: 56px; height: 78px; font-size: 1.4rem; font-weight: 700;
  background: var(--panel); color: var(--ink); border: 1px solid var(--border); border-radius: 10px;
  transition: transform 0.12s ease, border-color 0.12s ease;
}
.card-btn:not(:disabled):hover { transform: translateY(-4px); border-color: var(--accent); }

.reveal { display: flex; flex-direction: column; align-items: center; gap: 8px;
  background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
.reveal-cards { display: flex; align-items: center; gap: 16px; }
.reveal-card {
  width: 72px; height: 100px; display: grid; place-items: center; font-size: 2rem; font-weight: 700;
  background: var(--bg); border: 1px solid var(--border); border-radius: 12px;
  animation: flip-in 0.4s ease both;
}
@keyframes flip-in {
  from { transform: rotateY(90deg); opacity: 0; }
  to { transform: rotateY(0); opacity: 1; }
}
.reveal-outcome { font-weight: 700; margin: 0; }
.reveal-next { color: var(--muted); margin: 0; }

.status-banner { background: var(--panel); border: 1px dashed var(--border); border-radius: 8px;
  padding: 8px 12px; color: var(--muted); text-align: center; }

.round-log table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.round-log th, .round-log td { padding: 6px 8px; border-bottom: 1px solid var(--border); text-align: left; }
.round-log { max-height: 240px; overflow-y: auto; }

.code { font-family: ui-monospace, Menlo, monospace; letter-spacing: 3px; }
@media (max-width: 480px) {
  .card-btn { width: 44px; height: 62px; font-size: 1.1rem; }
  .prize-card { width: 80px; height: 112px; font-size: 2rem; }
}
```

`README.md`:
```markdown
# GOPS — Multiplayer Goofspiel

Real-time 2-player Goofspiel (Game of Pure Strategy). One player creates a room,
shares the link, the other joins. Both bid simultaneously each round for a
revealed prize card; highest total after 13 rounds wins. All game state is held
server-side (Next.js Route Handlers + Upstash Redis); clients poll for updates.

## Run locally

1. `npm install`
2. Create `.env.local` (copy `.env.local.example`) and fill in Upstash REST creds:
   - Easiest: create a free database at <https://console.upstash.com>, copy the
     **REST** URL + token.
   - Fully offline: run Redis in Docker and put `hiett/serverless-redis-http` in
     front of it, then point the two env vars at the SRH endpoint.
3. `npm run dev` and open <http://localhost:3000> in two browser windows (use one
   normal + one incognito so they get separate rooms in `localStorage`).

## Test

- `npm test` — full Vitest suite (engine, rooms, API handlers, hook, components).
  No live Redis needed; `@/lib/redis` is mocked with an in-memory fake.
- `npm run typecheck` — `tsc --noEmit`.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project into Vercel (framework preset: Next.js — no overrides).
3. In the Vercel project → **Storage** → add **Upstash Redis**. This injects
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` into all environments.
4. Deploy. No other configuration.

### Free-tier note

At the polling cadence in `hooks/useRoomState.ts` a full game is roughly
600–900 Redis commands, so the Upstash free tier supports ~10–15 games/day.
Raising the Upstash plan, or swapping the sync layer for push (Pusher/Ably),
lifts that ceiling — the Route Handlers stay the same.

## How it works

- `lib/gameEngine.ts` — pure rules (no I/O), fully unit-tested.
- `app/api/room/**` — thin handlers: `withLock` → `loadRoom` → engine → `saveRoom`
  → return `publicStateFor(seat)`. Secret state (prize order, opponent hand,
  unrevealed bids) never leaves the server.
- `seen:{code}:{seat}` keys track presence lock-free so frequent polls don't
  contend with bids.
- Auto-advance (`RESULT` → next round) runs lazily inside the next poll, 3s
  after the reveal.
```

- [ ] **Step 4: Run the build + full suite + manual QA**

Run: `npm test && npm run typecheck && npx next build`
Expected: all green; build compiles.

Manual QA checklist (run `npm run dev`, one normal + one incognito window):
- [ ] Create room as Alice (carryover mode); copy link; open it in the other window; join as Bob → both land in a `BIDDING` round 1.
- [ ] Lock a bid in one window → that hand disables, "Waiting for opponent's bid…" shows; the other window does **not** reveal the card.
- [ ] Second bid → both windows flip to the reveal, winner highlighted, score updates, auto-advances after ~3s.
- [ ] Play to round 13 → both see the end screen with matching final scores and full log.
- [ ] Click Rematch in both → fresh round 1, scores 0.
- [ ] Mid-game, refresh one window → it silently reconnects to the same seat and round.
- [ ] Mid-game, close one window → the other shows "Opponent disconnected…" within ~8s; reopen the link → banner clears.
- [ ] Open the room link in a third window → "Room is full".
- [ ] DevTools → Network: confirm no response body from `/state` ever contains the opponent's full hand or the prize deck order.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css README.md test/build.test.ts
git commit -m "feat: styling, reveal animation, README + deploy docs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Self-Review (completed during planning)

**1. Spec coverage**

| Spec section | Task(s) |
|---|---|
| §2 rules — 13 rounds, hands 1–13, prize permutation | 3, 5 |
| §2 tie `discard` | 4 |
| §2 tie `carryover` incl. final-round carry drop | 5 |
| §2 winning / draw / 91 total | 5 (`finalResult`, playthrough) |
| §4.1 stack, one Vercel project | 1 |
| §4.2 pure engine, all listed functions | 3–6 |
| §4.3 `withLock`, `generateCode`, presence outside blob | 9 (lock/presence), 2 (`generateCode`), 10 (collision retry in create route) |
| §4.4 Upstash client, `automaticDeserialization:false`, op set | 7 |
| §5 `RoomState` / `SeatState` / `LogEntry` / `PublicState` | 2 |
| §5 secret-state guarantees | 6 (assertions) |
| §6 `POST /api/room` | 10 |
| §6 `POST /join` (reconnect, fill, start, ROOM_FULL, 404) | 11 |
| §6 `POST /bid` (validate, resolve, idempotent, concurrent) | 12 |
| §6 `GET /state` (per-seat, lazy auto-advance, 403/404/400) | 13 |
| §6 `POST /rematch` | 14 |
| §6 error codes → status | 10 (`handle` table) |
| §7.1 routing + `localStorage` identity | 16 |
| §7.2 adaptive visibility-aware polling | 15 |
| §7.3 lazy auto-advance, client countdown only | 13 (server), 17 `RevealPanel` + 18 (countdown) |
| §7.4 presence banner | 18 (`bannerMessage`) |
| §7.5 all components | 16 (`Home`,`NameGate`), 17, 18 |
| §8 concurrency, idempotency, determinism | 4, 9, 12, 14 |
| §9 vitest, fake Redis, per-unit tests, manual pass | every task; 19 manual checklist |
| §10 file layout | File Structure table + all tasks |
| §11 local + Vercel deploy, free-tier note | 19 (`README.md`), 1 (`.env.local.example`) |
| §12 risk mitigations | reflected in 9 (lock TTL), 13 (server timestamps), 15 (visibility pause) |

No gaps found.

**2. Placeholder scan** — no "TBD"/"handle errors"/"similar to Task N"; every code step carries full code. The one forward reference (Task 16 → `GameBoard` from Task 18) is called out explicitly with a working placeholder and restored in Task 18.

**3. Type consistency** — `publicStateFor(state, seat, now, seen)` signature identical in Tasks 6, 10–14. `withLock(code, fn, opts?)` identical in Tasks 9, 11–14. `GameError(code, message)` from Task 2 used everywhere. `POLL_INTERVALS` keyed by `Phase | 'default'` in Task 15 and consumed there only. `PublicState` fields (incl. `youWantRematch` / `opponentWantsRematch`, added to the spec during planning) match across Tasks 2, 6, 17, 18. Route handler signature `(request, { params: Promise<{ code }> })` consistent in Tasks 11–14.
