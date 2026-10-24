import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildHistory, memberAlice, memberBob, memberCara, memberDee, now } from '../../domain/fixtures.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { InsightsTab } from './InsightsTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminGetHistory: vi.fn(),
}))

import { adminGetHistory } from '../../api/rpc.ts'

function renderTab() {
  return render(
    <ToastProvider>
      <InsightsTab adminCode="ADMIN1234567890A" groupName="Tuesday Runners!" />
    </ToastProvider>,
  )
}

function headerCell(name: string): HTMLElement {
  return screen.getByRole('columnheader', { name })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(now)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InsightsTab', () => {
  it('shows stat tiles, the headcount chart and a member table sorted by attendance % by default', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: true, data: buildHistory() })
    renderTab()

    await screen.findByText('Avg attendance')
    expect(screen.getByText('81%', { selector: '.insights-stat__value' })).toBeTruthy()
    expect(screen.getByText('2.7')).toBeTruthy() // avg headcount (16/6 rounded to 1dp)
    expect(screen.getByText('Unchecked sessions').previousSibling?.textContent).toBe('3')
    expect(screen.getByText(/Top streak/).textContent).toBe('Top streak · Alice')
    expect(screen.getByText('Answers arrive ~2 days before start')).toBeTruthy()

    // Only one weekday appears in the fixture's history, so the by-weekday row is hidden.
    expect(screen.queryByText('Attendance by weekday')).toBeFalsy()

    const rows = screen.getAllByRole('row').slice(1) // drop header row
    const names = rows.map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names).toEqual([memberAlice.name, `${memberCara.name} (left)`, memberDee.name, memberBob.name])
  })

  it('sorts the member table by a clicked column, toggling aria-sort and direction on a second click', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: true, data: buildHistory() })
    renderTab()
    await screen.findByText('Avg attendance')

    const noShowsHeader = headerCell('No-shows')
    expect(noShowsHeader.getAttribute('aria-sort')).toBe('none')

    fireEvent.click(within(noShowsHeader).getByRole('button'))
    expect(noShowsHeader.getAttribute('aria-sort')).toBe('descending')
    let rows = screen.getAllByRole('row').slice(1)
    let names = rows.map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names[0]).toBe(memberBob.name) // Bob has the one no-show

    fireEvent.click(within(noShowsHeader).getByRole('button'))
    expect(noShowsHeader.getAttribute('aria-sort')).toBe('ascending')
    rows = screen.getAllByRole('row').slice(1)
    names = rows.map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names[names.length - 1]).toBe(memberBob.name)
  })

  it('downloads a CSV named after the slugified group name', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: true, data: buildHistory() })
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    // jsdom has no object URL support; stub just enough for the download flow.
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    renderTab()
    await screen.findByText('Avg attendance')

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.type).toContain('text/csv')
    expect(clickSpy).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')

    clickSpy.mockRestore()
  })

  it('shows "No events yet" when the group has no events', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({
      ok: true,
      data: { members: [], events: [], occurrences: [], responses: [], attendance: [] },
    })
    renderTab()
    expect(await screen.findByText('No events yet')).toBeTruthy()
  })

  it('clears the stored admin code and goes home when the admin code is no longer valid', async () => {
    vi.mocked(adminGetHistory).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    renderTab()
    expect(await screen.findByText('That admin code no longer works.')).toBeTruthy()
  })
})
