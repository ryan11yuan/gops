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
