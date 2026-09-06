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
  it('shows a face card by its rank letter', () => {
    render(<PrizePile prizeCard={13} prizesRemaining={0} carry={0} />)
    expect(screen.getByTestId('prize-card')).toHaveTextContent('K')
    expect(screen.getByText(/worth 13 points/i)).toBeInTheDocument()
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
    await userEvent.click(screen.getByRole('button', { name: 'Five' }))
    expect(onPick).toHaveBeenCalledWith(5)
  })
  it('labels cards by rank rather than number', () => {
    render(<Hand hand={[1, 5, 11, 12, 13]} disabled={false} onPick={() => {}} />)
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['A', '5', 'J', 'Q', 'K'])
    expect(screen.getByRole('button', { name: 'Ace' })).toBeInTheDocument()
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
  it('shows face cards by their rank letter', () => {
    render(
      <RevealPanel
        reveal={{ p1Card: 13, p2Card: 1, winner: 'P1', awarded: 9 }}
        youSeat="P1"
        autoAdvanceAt={null}
        now={0}
      />,
    )
    expect(screen.getByTestId('reveal-p1')).toHaveTextContent('K')
    expect(screen.getByTestId('reveal-p2')).toHaveTextContent('A')
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
          { round: 1, prize: 12, carryApplied: 0, p1Card: 1, p2Card: 3, winner: 'P1', awarded: 12 },
          { round: 2, prize: 4, carryApplied: 0, p1Card: 2, p2Card: 8, winner: 'P2', awarded: 4 },
        ]}
      />,
    )
    expect(screen.getAllByRole('row')).toHaveLength(3) // header + 2
    expect(screen.getAllByRole('cell')[1]).toHaveTextContent('Q')
    expect(screen.getAllByRole('cell')[2]).toHaveTextContent('A')
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
