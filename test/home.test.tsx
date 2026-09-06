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
