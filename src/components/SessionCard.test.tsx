import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../domain/types.ts'
import { SessionCard } from './SessionCard.tsx'

const members = [
  { id: 'm1', name: 'Alice' },
  { id: 'm2', name: 'Bob' },
  { id: 'm3', name: 'Cara' },
]

function buildSession(overrides: Partial<Session> = {}): Session {
  return {
    event: {
      id: 'event-1',
      series_id: 'series-1',
      title: 'Practice',
      location: 'Gym',
      kind: 'weekly',
      starts_on: '2026-09-07',
      weekdays: [5],
      start_time: '19:00',
      ends_on: null,
      active: true,
    },
    occurrence_date: '2026-10-30',
    starts_at: '2026-10-30T17:00:00Z',
    answers: [
      { member_id: 'm1', status: 'going', note: null },
      { member_id: 'm2', status: 'cant', note: 'Busy that day' },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-23T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('SessionCard', () => {
  it('renders Going/Can\'t and highlights the current member\'s answer', () => {
    render(
      <SessionCard session={buildSession()} members={members} meId="m2" tz="Africa/Cairo" />,
    )

    const going = screen.getByRole('button', { name: 'Going' })
    const cant = screen.getByRole('button', { name: "Can't" })
    expect(going.getAttribute('aria-pressed')).toBe('false')
    expect(cant.getAttribute('aria-pressed')).toBe('true')
  })

  it('lists going, can\'t and no-reply groups by name, with notes shown for answers', () => {
    render(
      <SessionCard session={buildSession()} members={members} meId="m1" tz="Africa/Cairo" />,
    )

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByText(/Busy that day/)).toBeTruthy()
    expect(screen.getByText('Cara')).toBeTruthy()
  })

  it('submits the current note when tapping an answer', async () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(
      <SessionCard
        session={buildSession()}
        members={members}
        meId="m3"
        tz="Africa/Cairo"
        onAnswer={onAnswer}
      />,
    )

    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'Running late' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Going' }))

    expect(onAnswer).toHaveBeenCalledWith('going', 'Running late')
  })

  it('shows a Save note action only once the note changes after already answering', () => {
    render(
      <SessionCard session={buildSession()} members={members} meId="m1" tz="Africa/Cairo" />,
    )

    expect(screen.queryByRole('button', { name: 'Save note' })).toBeFalsy()

    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'See you there' },
    })

    expect(screen.getByRole('button', { name: 'Save note' })).toBeTruthy()
  })

  it('saves an edited note with the existing status, not a fresh answer', () => {
    const onAnswer = vi.fn().mockResolvedValue(undefined)
    render(
      <SessionCard
        session={buildSession()}
        members={members}
        meId="m2"
        tz="Africa/Cairo"
        onAnswer={onAnswer}
      />,
    )

    fireEvent.change(screen.getByLabelText('Note (optional)'), {
      target: { value: 'Still busy, sorry' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }))

    expect(onAnswer).toHaveBeenCalledWith('cant', 'Still busy, sorry')
  })

  it('shows a quiet empty state when the event has no upcoming occurrence', () => {
    render(
      <SessionCard
        session={buildSession({ occurrence_date: null, starts_at: null })}
        members={members}
        meId="m1"
        tz="Africa/Cairo"
      />,
    )

    expect(screen.getByText('No upcoming session')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Going' })).toBeFalsy()
  })

  it('disables Going/Can\'t and shows a hint until a name is picked', () => {
    render(<SessionCard session={buildSession()} members={members} meId={null} tz="Africa/Cairo" />)

    const going = screen.getByRole('button', { name: 'Going' }) as HTMLButtonElement
    const cant = screen.getByRole('button', { name: "Can't" }) as HTMLButtonElement
    expect(going.disabled).toBe(true)
    expect(cant.disabled).toBe(true)
    expect(screen.getByText('Pick your name first')).toBeTruthy()
  })

  it('shows the "Are you coming" headline for a member, not for admin mode', () => {
    render(
      <SessionCard session={buildSession()} members={members} meId="m1" tz="Africa/Cairo" />,
    )
    expect(screen.getByText('Are you coming this Friday?')).toBeTruthy()

    const { container } = render(
      <SessionCard
        session={buildSession()}
        members={members}
        meId={null}
        tz="Africa/Cairo"
        adminMode
      />,
    )
    expect(container.querySelector('.session-card__headline')).toBeFalsy()
    expect(container.querySelector('.session-card__answers')).toBeFalsy()
  })
})
