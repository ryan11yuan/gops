# Multiplayer Goofspiel (GOPS) — Design Spec

**Date:** 2026-09-06
**Status:** Approved for planning
**Project:** `gops-game/` (Next.js App Router, deployed to Vercel)

---

## 1. Summary

A real-time, browser-based, 2-player game of Goofspiel (a.k.a. GOPS, "Game of
Pure Strategy"). One player creates a room and shares a link; a second player
joins with it. Both get identical 13-card hands and bid simultaneously each
round for a revealed prize card. Higher bid wins the prize's point value; after
13 rounds the higher total wins. No login.

The server (Next.js Route Handlers backed by Upstash Redis) is the sole
authority for game state, including the shuffled prize order and both hands, so
a client cannot inspect page source or network traffic to learn the opponent's
cards or upcoming prizes.

---

## 2. Game rules

- Three suits of 13 cards, values 1–13 (Ace–King).
- One suit is the **prize deck**: shuffled, face down.
- Player 1 (seat `P1`) holds a full second suit as their hand (values 1–13).
- Player 2 (seat `P2`) holds a full third suit as their hand (values 1–13).
- The game runs exactly 13 rounds, until every prize card has been contested.

**Each round**

1. The top prize card is flipped face up; both players see its value.
2. Each player secretly picks one card from their own hand to bid.
3. When both bids are locked, both are revealed simultaneously.
4. Higher bid wins the prize card; its value is added to the winner's score.
5. **Tie handling** (room-level setting, chosen at creation, locked once the
   game starts):
   - `discard` (default): the prize card is discarded, nobody scores it.
   - `carryover`: the tied prize value is added to a running `carry`. The next
     decisive round's winner takes `prizeCard + carry`, and `carry` resets to 0.
     Repeated ties keep stacking `carry`. **A tie on the final round in
     `carryover` mode drops the carry** (nobody scores it) — surfaced in the
     round log and end screen.
6. Both bid cards are spent and removed from their hands; they cannot be reused.
7. Repeat for all 13 rounds.

**Winning**

- After 13 rounds, sum each player's prize points.
- Higher total wins. 91 points total across all prize cards (1+…+13); exact
  margins depend on ties/discards.
- A tied final score is displayed explicitly as a **draw**.

---

## 3. Scope

### In scope for v1

- Room creation + join by short code / shareable URL, no accounts.
- Authoritative server state; secret state (prize order, opponent hand,
  unrevealed bids) never sent to clients.
- Full 13-round game loop with simultaneous bidding and a "waiting for
  opponent" state.
- Simultaneous reveal with a light CSS flip transition, winner highlight, then
  auto-advance after ~3 seconds.
- **Player names**: each player enters a display name on join (used in
  scoreboard, round log, end screen).
- **Tie-carryover toggle**: room creator picks `discard` (default) or
  `carryover` before the game starts.
- **Round history log**: every resolved round records prize value, both bids,
  winner, points awarded; visible during and after the match.
- Reconnect after refresh / network drop via a per-room `playerId` token in
  `localStorage`.
- Disconnect handling: the other player sees a non-blocking "opponent
  disconnected" banner; state is preserved and resumes on reconnect.
- End screen: final scores, winner or draw, full round log, **Rematch** (same
  room/code persists; both players must accept; scores/round/log/carry reset;
  seats, names, and tie mode are kept).

### Out of scope for v1

- User accounts or persistent stats across games.
- Matchmaking with strangers.
- AI opponent.
- 3+ players.
- Sound effects.
- Spectators (a third visitor to a full room is rejected).

---

## 4. Architecture

### 4.1 Stack

- **Next.js (App Router) + React + TypeScript**, single Vercel project.
- UI: React client components.
- Backend: Route Handlers under `app/api/`. Thin adapters — load room → call
  pure engine → save room → return per-seat public state.
- **State store:** Upstash Redis, added via the Vercel Marketplace (auto-injects
  `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`). One JSON blob per
  room at key `room:{code}`, with a sliding 2-hour TTL that also serves as
  automatic room reaping (no cron).
- **Sync:** client polling. No persistent connection (Vercel serverless has no
  long-lived process or shared memory).

### 4.2 Pure rules engine — `lib/gameEngine.ts`

No I/O. Operates on a `RoomState` value and returns a new one (or a typed
error). Functions:

- `createGame(opts): RoomState` — code, seed, `tieMode`, P1 seat, `phase: 'LOBBY'`.
- `startGame(state): RoomState` — seeded shuffle of prize deck, deal 1–13 to
  each seat, flip round-1 prize, `phase: 'BIDDING'`. Called when P2 fills the
  second seat.
- `submitBid(state, seat, card): RoomState` — validate and record a bid; if both
  seats are now locked, calls `resolveRound`.
- `resolveRound(state): RoomState` — compare bids, award `prizeCard + carry` to
  the higher; move both bid cards to `spent`; apply tie rule; append a
  `LogEntry`; `phase: 'RESULT'`; stamp `revealedAt`.
- `advanceRound(state): RoomState` — precondition `phase === 'RESULT'`. If prize
  cards remain: flip next prize, clear `bids`, `phase: 'BIDDING'`. Else:
  `phase: 'GAMEOVER'`, compute `finalResult`.
- `requestRematch(state, seat): RoomState` — set `seats[seat].wantsRematch`; if
  both set, reset scores/round/log/carry/bids/wantsRematch, reshuffle (new
  seed), redeal, `phase: 'BIDDING'`; keep seats, names, `tieMode`.
- `publicStateFor(state, seat): PublicState` — the only data a client ever
  receives. Omits `prizeDeck`, the opponent's live `hand`, and either bid while
  `phase === 'BIDDING'`.
- `finalResult(state): { p1: number; p2: number; winner: 'P1'|'P2'|'DRAW' }`.

### 4.3 Room + Redis helpers — `lib/rooms.ts`

- `loadRoom(code)`, `saveRoom(state)` (JSON serialize; `EXPIRE` to 2h on every
  write).
- `withLock(code, fn)` — `SET lock:room:{code} <id> NX PX 3000`; ~5 retries with
  small backoff; run `fn`; `DEL` the lock (only if still ours). **Every write to
  the room blob** goes through this: `bid`, `join`, `rematch`, and the lazy
  auto-advance. The `PX 3000` expiry bounds a crash-while-locked.
  - Upgrade path (documented, not built for v1): a Redis `EVAL` Lua script doing
    the full read-modify-write atomically with `cjson`, if lock contention ever
    shows up. Not needed for 2 players.
- `generateCode()` — 4 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (no
  ambiguous glyphs); `SET room:{code} … NX` and retry on collision.
- **Presence lives outside the blob.** `touchSeen(code, seat)` does
  `SET seen:{code}:{seat} <now> EX 30` — a tiny standalone key, no lock, no blob
  write. `readSeen(code, seat)` reads it. This keeps the common poll path
  (§7.2) lock-free and off the write path, so frequent polling never contends
  with `bid`. `SeatState` therefore has **no** `lastSeenAt` field.

### 4.4 Upstash client — `lib/redis.ts`

Singleton `@upstash/redis` client from env. The ops used: `get`, `set`,
`set … nx`, `set … nx px`, `set … ex`, `del`, `expire`.

---

## 5. Data model

```ts
type Seat = 'P1' | 'P2';
type Phase = 'LOBBY' | 'BIDDING' | 'RESULT' | 'GAMEOVER';
type TieMode = 'discard' | 'carryover';

interface SeatState {
  playerId: string;      // random token; matched on reconnect
  name: string;
  hand: number[];        // remaining cards, values 1..13 — SERVER ONLY for opponent
  spent: number[];       // cards already played (public)
  score: number;
  wantsRematch: boolean;
}
// Presence is NOT in the blob: standalone key `seen:{code}:{seat}`
// (value = ms epoch, EX 30), written lock-free on every state poll.

interface LogEntry {
  round: number;
  prize: number;         // face value of the prize card contested
  carryApplied: number;  // carry added to the pot for this round (0 unless carryover)
  p1Card: number;
  p2Card: number;
  winner: Seat | 'TIE';
  awarded: number;       // points the winner gained (0 on TIE); carry dropped on final-round tie
}

interface RoomState {
  code: string;
  createdAt: number;
  seed: string;                 // drives deterministic shuffle; replayable in tests
  tieMode: TieMode;             // locked once phase leaves LOBBY
  phase: Phase;
  round: number;               // 1..13
  prizeDeck: number[];         // full shuffled order — SERVER ONLY
  prizeCard: number | null;    // current face-up value
  prizesRevealed: number[];    // values already contested (public)
  carry: number;               // stacked tied value (carryover mode)
  seats: { P1: SeatState; P2: SeatState | null };
  bids: { P1: number | null; P2: number | null };  // SERVER ONLY until both set
  log: LogEntry[];
  revealedAt: number | null;   // set on RESULT; drives lazy auto-advance
}
```

### `PublicState` (what a client receives)

```ts
interface PublicState {
  code: string;
  phase: Phase;
  tieMode: TieMode;
  round: number;                 // 1..13
  you: { seat: Seat; name: string; hand: number[]; spent: number[]; score: number };
  opponent: {
    name: string | null;         // null while seat empty (LOBBY)
    cardsRemaining: number;
    spent: number[];
    score: number;
    connected: boolean;          // now - seen:{code}:{oppSeat} < 8000
  } | null;
  prizeCard: number | null;
  prizesRevealed: number[];
  prizesRemaining: number;       // count only
  carry: number;
  youLocked: boolean;
  opponentLocked: boolean;       // boolean only — never the card
  reveal: { p1Card: number; p2Card: number; winner: Seat | 'TIE'; awarded: number } | null;
                                 // populated only while phase === 'RESULT'
  log: LogEntry[];
  finalResult: { p1: number; p2: number; winner: Seat | 'DRAW' } | null;  // GAMEOVER only
  autoAdvanceAt: number | null;  // revealedAt + 3000, so the client can show a countdown
}
```

**Secret-state guarantees** (asserted in tests):

- `prizeDeck` order is never in any `PublicState`.
- The opponent's remaining `hand` is never in any `PublicState` (only
  `cardsRemaining` + public `spent`).
- Neither bid value appears in any `PublicState` while `phase === 'BIDDING'`;
  both appear only once `phase === 'RESULT'`.

---

## 6. API

All responses JSON. Errors: `{ error: { code, message } }` with an HTTP status.

| Method + path | Body | Behavior | Returns |
|---|---|---|---|
| `POST /api/room` | `{ name, tieMode }` | `generateCode()`; `createGame`; fill `P1`; `phase: 'LOBBY'`. | `{ code, playerId, seat: 'P1', state: PublicState }` |
| `POST /api/room/[code]/join` | `{ name, playerId? }` | Under lock. `playerId` matches a seat → reconnect to it. Else if `P2` empty → fill it; if both seats now filled → `startGame`. Else → `409 ROOM_FULL`. Missing room → `404 ROOM_NOT_FOUND`. | `{ playerId, seat, state: PublicState }` |
| `POST /api/room/[code]/bid` | `{ playerId, card }` | Under lock. Validate: `phase === 'BIDDING'`, `playerId` resolves to a seat, `card` in that seat's `hand`, seat not already locked. Record; if both locked → `resolveRound`. Already-locked seat → `200` with current state (idempotent). Invalid card / wrong phase → `400 INVALID_BID` / `409 WRONG_PHASE`. | `{ state: PublicState }` |
| `GET /api/room/[code]/state?playerId=` | — | Lock-free common path: `SET seen:{code}:{seat}` (§4.3), read blob + both `seen` keys, return per-seat state. Takes the lock **only** when `phase === 'RESULT' && now >= revealedAt + 3000` (or a pending `GAMEOVER`) to run the lazy auto-advance (§7.3). Unknown `playerId` → `403 UNKNOWN_PLAYER`. Missing room → `404 ROOM_NOT_FOUND`. | `{ state: PublicState }` |
| `POST /api/room/[code]/rematch` | `{ playerId }` | Under lock. Precondition `phase === 'GAMEOVER'`. Set seat `wantsRematch`; if both → `requestRematch` reset. | `{ state: PublicState }` |

Error codes: `ROOM_NOT_FOUND` (404), `ROOM_FULL` (409), `UNKNOWN_PLAYER` (403),
`INVALID_BID` (400), `WRONG_PHASE` (409), `BAD_REQUEST` (400).

---

## 7. Client behavior

### 7.1 Routing + identity

- `app/page.tsx` — home. "Create room" form (name + tie-mode radio) → `POST
  /api/room` → store `localStorage["gops:{code}"] = playerId` → navigate to
  `/r/{code}`. Also a "Join by code" input → navigate to `/r/{code}`.
- `app/r/[code]/page.tsx` — room shell. On mount, read
  `localStorage["gops:{code}"]`:
  - present → `POST join` with `{ playerId }` (silent reconnect).
  - absent → render `NameGate`; on submit → `POST join` with `{ name }` → store
    the returned `playerId`.
- After a successful join, start polling and render `GameBoard`.

### 7.2 Polling — `hooks/useRoomState.ts`

- Polls `GET /api/room/[code]/state?playerId=…` on an adaptive, visibility-aware
  interval:
  - `RESULT` phase: ~600ms (tight, for near-simultaneous reveal + advance).
  - `BIDDING` phase: ~1200ms.
  - `LOBBY` / `GAMEOVER`: ~2500ms.
  - `document.visibilityState === 'hidden'`: paused; one immediate poll on
    re-show.
- Returns `{ state, error, actions: { bid, rematch } }`. Actions POST then
  immediately refetch so the acting player sees their own change without waiting
  for the next tick.
- Network / 5xx: keep the last rendered `state`, show a "reconnecting…"
  indicator, keep polling. `ROOM_NOT_FOUND` → "This room has ended" + link home.
  `ROOM_FULL` → "Room is full" + "create a new room" button.

### 7.3 Lazy auto-advance (no server timer)

Vercel has no background process, so `RESULT → BIDDING/GAMEOVER` is performed
inside the next `bid` or `state` call: when `phase === 'RESULT'` and
`Date.now() >= revealedAt + 3000`, that call takes `withLock`, re-reads the
blob (guarding against a racing advance), and calls `advanceRound`. With ~600ms
polling during `RESULT`, both clients converge within ~1s. If both tabs are
closed on the result screen, the game waits there harmlessly until someone polls
again. The client uses `autoAdvanceAt` only to render a countdown, never to
mutate.

### 7.4 Presence

`opponent.connected` is derived server-side from the standalone key
`seen:{code}:{oppSeat}` (`now - value < 8000`; the key itself has `EX 30`).
Every `state` poll refreshes the caller's own `seen:{code}:{seat}` key,
lock-free. When `connected` is false, `GameBoard` shows a non-blocking "Opponent
disconnected — waiting to reconnect…" banner. No game state changes; the banner
clears as soon as the opponent polls again. A fully abandoned room expires on
its 2h TTL.

### 7.5 Components

- `Home` — create / join forms.
- `NameGate` — name entry for a first-time joiner.
- `GameBoard` — top-level room view; switches on `phase`.
- `PrizePile` — face-down deck with `prizesRemaining` count; current `prizeCard`
  large and centered; `carry` badge ("+N carried") when `carry > 0`.
- `Hand` — the player's cards as a selectable row; `spent` cards disabled; whole
  hand disabled once `youLocked` or `phase !== 'BIDDING'`.
- `Scoreboard` — both names + running scores + round `n / 13`.
- `RevealPanel` — during `RESULT`, both bid cards side by side, winner
  highlighted, points awarded, countdown to next round.
- `RoundLog` — scrollable list of `LogEntry` rows; always available during and
  after the match.
- `EndScreen` — final scores, winner or **draw**, full `RoundLog`, **Rematch**
  button ("waiting for opponent to accept" between one and both).
- `StatusBanner` — "waiting for opponent", "opponent disconnected",
  "reconnecting…", "room ended".

---

## 8. Concurrency + correctness

- **All mutations go through `withLock(code, fn)`** — `bid`, `join`, `rematch`,
  and the lazy auto-advance inside `state`. Prevents lost updates on the shared
  blob when both players act at the same instant.
- **Idempotency**: a repeat `bid` from a seat that already locked returns the
  current state, not an error. `rematch` re-accept is a no-op.
- **Phase guards**: every mutating engine function checks `phase` and returns a
  typed error rather than corrupting state.
- **Determinism**: `seed` is stored in the room; the shuffle is seeded
  Fisher–Yates (`lib/rng.ts`), so a game is fully replayable in tests.

---

## 9. Testing

Runner: **vitest**.

### 9.1 `test/gameEngine.test.ts` (pure, no mocks)

- Deck construction and deal: each seat gets exactly `[1..13]`; prize deck is a
  permutation of `[1..13]`.
- Higher card wins; winner's score increases by the prize value.
- Tie in `discard` mode: nobody scores, `carry` stays 0, both cards spent.
- Tie in `carryover` mode: `carry += prize`; next decisive winner gains
  `prize + carry`; `carry` resets to 0; repeated ties stack.
- Final-round tie in `carryover`: carry is dropped; `LogEntry.awarded === 0`.
- Score totals: non-tie game sums to 91; games with discards sum to `91 − Σ
  discarded`.
- `phase` transitions: `LOBBY → BIDDING → (RESULT → BIDDING)×12 → RESULT →
  GAMEOVER`.
- `finalResult`: correct `winner` / `DRAW`.
- **Secret-state assertions**: for every phase, `JSON.stringify(publicStateFor(...))`
  contains no `prizeDeck` ordering, no opponent `hand`, and no bid value while
  `phase === 'BIDDING'`.
- Full seeded 13-round playthrough with a fixed script → exact expected end
  state.

### 9.2 `test/rooms.test.ts` (in-memory fake Redis)

- `generateCode` retries on a seeded collision and yields only allowed glyphs.
- `withLock` serializes two overlapping callers (second waits for the first).
- Every `saveRoom` sets/refreshes the 2h TTL.

### 9.3 `test/api.test.ts` (Route Handlers against the fake Redis)

- `create → join → startGame` produces a `BIDDING` room with dealt hands.
- Scripted full game via the handlers to `GAMEOVER`; assert final scores + log.
- Concurrent double-`bid` (both seats fire together) resolves exactly one round.
- Third joiner with no token → `ROOM_FULL`.
- Reconnect: `join` with a known `playerId` returns the same seat and full
  state, including `youLocked` mid-round.
- `rematch`: both accept → fresh `BIDDING` room, scores 0, new `seed`, seats and
  names retained.

### 9.4 Manual

`npm run dev`; one normal + one incognito window; play a full game, refresh
mid-round in each window to confirm reconnect, close one tab to confirm the
disconnect banner. Post-deploy smoke test on the Vercel URL.

---

## 10. Project layout

```
gops-game/
  app/
    page.tsx
    r/[code]/page.tsx
    api/room/route.ts
    api/room/[code]/join/route.ts
    api/room/[code]/bid/route.ts
    api/room/[code]/rematch/route.ts
    api/room/[code]/state/route.ts
  lib/
    gameEngine.ts
    rooms.ts
    redis.ts
    types.ts
    rng.ts
  components/
    Home.tsx  NameGate.tsx  GameBoard.tsx  PrizePile.tsx  Hand.tsx
    Scoreboard.tsx  RoundLog.tsx  RevealPanel.tsx  EndScreen.tsx  StatusBanner.tsx
  hooks/
    useRoomState.ts
  test/
    gameEngine.test.ts
    rooms.test.ts
    api.test.ts
  README.md
  .gitignore
  package.json
  next.config.js
  tsconfig.json
```

---

## 11. Deployment

### Local

1. `npm install`
2. `.env.local` with `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
   Easiest is a free Upstash database (works from localhost). Fully offline
   alternative: local Redis in Docker + `hiett/serverless-redis-http` (a.k.a.
   SRH) in front of it, which speaks the Upstash REST protocol the client
   expects. The README will spell out both.
3. `npm run dev` → open two tabs at `http://localhost:3000`.

### Vercel

1. Push the repo to GitHub.
2. Import the project into Vercel.
3. Storage tab → add **Upstash Redis** (auto-injects both env vars into all
   environments).
4. Deploy. No other configuration.

### Notes

- The Upstash free tier's daily command budget allows roughly **10–15 full
  games/day** at the polling rates in §7.2. Raising the Upstash plan, or
  switching the sync layer to the Pusher-push variant (same Redis-backed
  handlers, updates pushed instead of polled), is the fix if that ceiling is
  reached.
- No secrets in the repo; `.env.local` is gitignored.

---

## 12. Risks / trade-offs

| Risk | Mitigation |
|---|---|
| Polling isn't true push; reveal not perfectly simultaneous | ~600ms poll during `RESULT`; sub-second skew is acceptable for a turn-based card game |
| Upstash free-tier command quota | Documented ceiling + adaptive/visibility-aware polling; clear upgrade path |
| Lock held after a crash mid-mutation | `PX 3000` auto-expiry; mutations are short |
| Serverless cold start adds latency to a poll | Acceptable at this cadence; no correctness impact |
| Both clients close on `RESULT`, game "stuck" | Resolves on the next poll from either side; TTL reaps if truly abandoned |
| Clock skew between serverless invocations affects auto-advance timing | All timestamps are server-side (`Date.now()` in the handler); only relative deltas matter |
