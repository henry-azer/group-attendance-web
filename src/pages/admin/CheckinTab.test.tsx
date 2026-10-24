import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHistory, memberAlice, memberBob, memberCara, memberDee, now } from '../../domain/fixtures.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { CheckinTab, initialMarks } from './CheckinTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminGetHistory: vi.fn(),
  adminMarkAttendance: vi.fn(),
  adminUnskipOccurrence: vi.fn(),
}))

import { adminGetHistory, adminMarkAttendance, adminUnskipOccurrence } from '../../api/rpc.ts'

function renderTab() {
  return render(
    <ToastProvider>
      <CheckinTab adminCode="ADMIN1234567890A" tz="Africa/Cairo" />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  // Only fake Date (for the "past" cutoff CheckinTab computes from Date.now()) — real timers stay
  // on so Testing Library's async findBy/waitFor polling (which uses real setTimeout) still works.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('initialMarks', () => {
  it('prefers an existing attendance mark over the member\'s answer', () => {
    const responses = [
      { event_id: 'e1', occurrence_date: '2026-10-01', member_id: 'm1', status: 'going' as const, note: null, first_answered_at: '2026-09-30T10:00:00Z', updated_at: '2026-09-30T10:00:00Z' },
    ]
    const attendance = [{ event_id: 'e1', occurrence_date: '2026-10-01', member_id: 'm1', attended: false }]

    expect(initialMarks(responses, attendance, ['m1'])).toEqual({ m1: false })
  })

  it('falls back to the "going" answer when there is no attendance mark yet', () => {
    const responses = [
      { event_id: 'e1', occurrence_date: '2026-10-01', member_id: 'm1', status: 'going' as const, note: null, first_answered_at: '2026-09-30T10:00:00Z', updated_at: '2026-09-30T10:00:00Z' },
    ]
    expect(initialMarks(responses, [], ['m1'])).toEqual({ m1: true })
  })

  it('defaults to false with neither an attendance mark nor a "going" answer', () => {
    expect(initialMarks([], [], ['m1'])).toEqual({ m1: false })
  })
})

describe('CheckinTab', () => {
  it('lists past sessions newest first with checked/unchecked/skipped badges', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: true, data: buildHistory() })
    renderTab()

    await screen.findByText('Skipped')
    const headers = screen.getAllByRole('button', { name: /Practice/ })
    // Newest first: 10-19 (skipped) before 10-12 before 09-21 (checked) before 09-07 (checked).
    const order = headers.map((el) => el.textContent ?? '')
    expect(order.findIndex((t) => t.includes('19 Oct'))).toBeLessThan(order.findIndex((t) => t.includes('12 Oct')))
    expect(order.findIndex((t) => t.includes('12 Oct'))).toBeLessThan(order.findIndex((t) => t.includes('7 Sep')))

    expect(screen.getAllByText('Unchecked').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Checked').length).toBeGreaterThan(0)
  })

  it('opens an unchecked session pre-ticked from answers and saves attendance for expected members', async () => {
    vi.mocked(adminGetHistory)
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
    vi.mocked(adminMarkAttendance).mockResolvedValueOnce({
      ok: true,
      data: { event_id: 'event-practice', occurrence_date: '2026-10-12', attendance: [] },
    })
    renderTab()

    const headers = await screen.findAllByRole('button', { name: /Practice/ })
    const oct12 = headers.find((el) => (el.textContent ?? '').includes('12 Oct'))!
    fireEvent.click(oct12)

    // Expected at 10-12: Alice, Bob, Dee (Cara already left). Alice and Bob said going; Dee
    // didn't reply, so she starts Absent.
    expect(await screen.findByText(memberAlice.name)).toBeTruthy()
    const aliceToggle = screen.getByText(memberAlice.name).closest('li')!.querySelector('button')!
    const bobToggle = screen.getByText(memberBob.name).closest('li')!.querySelector('button')!
    const deeToggle = screen.getByText(memberDee.name).closest('li')!.querySelector('button')!
    expect(aliceToggle.textContent).toBe('Attended')
    expect(bobToggle.textContent).toBe('Attended')
    expect(deeToggle.textContent).toBe('Absent')
    expect(screen.queryByText(memberCara.name)).toBeFalsy() // Cara: collapsed under Others

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))

    await waitFor(() =>
      expect(adminMarkAttendance).toHaveBeenCalledWith({
        admin: 'ADMIN1234567890A',
        event: 'event-practice',
        date: '2026-10-12',
        marks: expect.arrayContaining([
          { member_id: memberAlice.id, attended: true },
          { member_id: memberBob.id, attended: true },
          { member_id: memberDee.id, attended: false },
        ]),
      }),
    )
    expect(await screen.findByText('Attendance saved')).toBeTruthy()
  })

  it('lets a walk-in be ticked from the collapsed Others section', async () => {
    vi.mocked(adminGetHistory)
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
    vi.mocked(adminMarkAttendance).mockResolvedValueOnce({
      ok: true,
      data: { event_id: 'event-practice', occurrence_date: '2026-10-12', attendance: [] },
    })
    renderTab()

    const headers = await screen.findAllByRole('button', { name: /Practice/ })
    const oct12 = headers.find((el) => (el.textContent ?? '').includes('12 Oct'))!
    fireEvent.click(oct12)
    await screen.findByText(memberAlice.name)

    fireEvent.click(screen.getByRole('button', { name: /Others/ }))
    const caraToggle = screen.getByText(memberCara.name).closest('li')!.querySelector('button')!
    expect(caraToggle.textContent).toBe('Mark as walk-in')
    fireEvent.click(caraToggle)
    expect(caraToggle.textContent).toBe('Attended')

    fireEvent.click(screen.getByRole('button', { name: 'Save attendance' }))

    await waitFor(() =>
      expect(adminMarkAttendance).toHaveBeenCalledWith(
        expect.objectContaining({
          marks: expect.arrayContaining([{ member_id: memberCara.id, attended: true }]),
        }),
      ),
    )
  })

  it('unskips a skipped occurrence and refetches history', async () => {
    vi.mocked(adminGetHistory)
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
      .mockResolvedValueOnce({ ok: true, data: buildHistory() })
    vi.mocked(adminUnskipOccurrence).mockResolvedValueOnce({
      ok: true,
      data: { event_id: 'event-practice', occurrence_date: '2026-10-19', skipped: false, reason: null },
    })
    renderTab()

    await screen.findByText('Skipped')
    fireEvent.click(screen.getByRole('button', { name: 'Unskip' }))

    await waitFor(() =>
      expect(adminUnskipOccurrence).toHaveBeenCalledWith({
        admin: 'ADMIN1234567890A',
        event: 'event-practice',
        date: '2026-10-19',
      }),
    )
    await waitFor(() => expect(adminGetHistory).toHaveBeenCalledTimes(2))
  })

  it('clears the stored admin code and goes home when the admin code is no longer valid', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    renderTab()

    expect(await screen.findByText('That admin code no longer works.')).toBeTruthy()
  })
})
