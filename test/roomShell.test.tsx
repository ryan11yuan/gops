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
