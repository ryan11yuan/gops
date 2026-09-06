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
