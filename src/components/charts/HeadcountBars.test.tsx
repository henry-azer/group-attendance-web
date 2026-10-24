import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionStat } from '../../domain/types.ts'
import { HeadcountBars } from './HeadcountBars.tsx'

afterEach(() => {
  document.body.innerHTML = ''
})

function buildSessions(overrides: Partial<SessionStat>[] = []): SessionStat[] {
  const base: SessionStat[] = [
    { date: '2026-10-09', startsAt: '2026-10-09T18:00:00Z', expected: 10, came: 7, cant: 1, noReply: 2, checked: true },
    { date: '2026-10-16', startsAt: '2026-10-16T18:00:00Z', expected: 11, came: 8, cant: 2, noReply: 1, checked: true },
    { date: '2026-10-23', startsAt: '2026-10-23T18:00:00Z', expected: 12, came: 9, cant: 1, noReply: 2, checked: false },
  ]
  return base.map((s, i) => ({ ...s, ...overrides[i] }))
}

describe('HeadcountBars', () => {
  it('renders one labelled rect per session, formatted as "<weekday> <day> <month>: N came of M"', () => {
    const sessions = buildSessions()
    render(<HeadcountBars sessions={sessions} />)

    const hits = screen.getAllByRole('img')
    expect(hits.length).toBe(3)
    expect(screen.getByLabelText('Fri 9 Oct: 7 came of 10')).toBeTruthy()
    expect(screen.getByLabelText('Fri 16 Oct: 8 came of 11')).toBeTruthy()
    expect(screen.getByLabelText('Fri 23 Oct: 9 came of 12')).toBeTruthy()
  })

  it('shows an unchecked legend note only when a session is unchecked', () => {
    render(<HeadcountBars sessions={buildSessions()} />)
    expect(screen.getByText(/based on answers/i)).toBeTruthy()
  })

  it('omits the unchecked legend note when every session is checked', () => {
    const sessions = buildSessions().map((s) => ({ ...s, checked: true }))
    render(<HeadcountBars sessions={sessions} />)
    expect(screen.queryByText(/based on answers/i)).toBeFalsy()
  })

  it('shows "No past sessions yet" when there are zero sessions', () => {
    render(<HeadcountBars sessions={[]} />)
    expect(screen.getByText('No past sessions yet')).toBeTruthy()
    expect(screen.queryAllByRole('img').length).toBe(0)
  })

  it('renders no bar for a zero-expected session, and scales the y-axis off the other sessions', () => {
    const sessions = buildSessions([
      {},
      { expected: 0, came: 0, cant: 0, noReply: 0, checked: false },
    ]).slice(0, 2)
    const { container } = render(<HeadcountBars sessions={sessions} />)

    // No "came"/"cant"/"noreply"/hatch segment for the zero-expected session — only its baseline
    // tick — while the real session (expected: 10) still gets its normal segments.
    expect(container.querySelectorAll('.headcount-bars__seg--came').length).toBe(1)
    expect(container.querySelectorAll('.headcount-bars__seg--hatch').length).toBe(0)
    expect(container.querySelectorAll('.headcount-bars__seg--baseline').length).toBe(1)
  })

  it('omits the unchecked legend note when the only unchecked session has nothing expected', () => {
    const sessions = buildSessions([
      { checked: true },
      { expected: 0, came: 0, cant: 0, noReply: 0, checked: false },
    ]).slice(0, 2)
    render(<HeadcountBars sessions={sessions} />)
    expect(screen.queryByText(/based on answers/i)).toBeFalsy()
  })
})
