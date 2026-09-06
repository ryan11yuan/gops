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
