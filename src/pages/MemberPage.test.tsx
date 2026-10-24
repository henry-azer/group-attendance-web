import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Result } from '../api/rpc.ts'
import type { PublicGroup } from '../domain/types.ts'
import { ToastProvider } from '../ui/Toast.tsx'
import { MemberPage } from './MemberPage.tsx'

vi.mock('../api/rpc.ts', () => ({
  getGroupPublic: vi.fn(),
  submitResponse: vi.fn(),
}))

import { getGroupPublic, submitResponse } from '../api/rpc.ts'

const SHARE = 'ABC123XYZ9'

function buildGroup(overrides: Partial<PublicGroup> = {}): PublicGroup {
  return {
    name: 'Friday Futsal',
    timezone: 'Africa/Cairo',
    members: [
      { id: 'm1', name: 'Alice' },
      { id: 'm2', name: 'Bob' },
    ],
    sessions: [
      {
        event: {
          id: 'e1',
          series_id: 's1',
          title: 'Practice',
          location: null,
          kind: 'weekly',
          starts_on: '2026-10-01',
          weekdays: [5],
          start_time: '19:00',
          ends_on: null,
          active: true,
        },
        occurrence_date: '2026-10-30',
        starts_at: '2026-10-30T17:00:00Z',
        answers: [{ member_id: 'm1', status: 'going', note: null }],
      },
    ],
    ...overrides,
  }
}

function renderPage(shareCode = SHARE) {
  return render(
    <ToastProvider>
      <MemberPage shareCode={shareCode} />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
})

describe('MemberPage', () => {
  it('shows "This link doesn\'t match any group" on not_found', async () => {
    vi.mocked(getGroupPublic).mockResolvedValueOnce({ ok: false, error: 'not_found' })

    renderPage()

    expect(await screen.findByText("This link doesn't match any group")).toBeTruthy()
  })

  it('clears a stale remembered member id that is no longer in the group', async () => {
    window.localStorage.setItem(`ga.member.${SHARE}`, 'no-longer-a-member')
    vi.mocked(getGroupPublic).mockResolvedValueOnce({ ok: true, data: buildGroup() })

    renderPage()

    await screen.findByText('Friday Futsal')
    expect(window.localStorage.getItem(`ga.member.${SHARE}`)).toBeNull()
    const aliceChip = screen.getByRole('radio', { name: 'Alice' })
    const bobChip = screen.getByRole('radio', { name: 'Bob' })
    expect(aliceChip.getAttribute('aria-checked')).toBe('false')
    expect(bobChip.getAttribute('aria-checked')).toBe('false')
  })

  it('shows an error toast and triggers a refetch when the session has closed', async () => {
    vi.mocked(getGroupPublic)
      .mockResolvedValueOnce({ ok: true, data: buildGroup() })
      .mockResolvedValueOnce({ ok: true, data: buildGroup() })
    vi.mocked(submitResponse).mockResolvedValueOnce({ ok: false, error: 'session_closed' })

    renderPage()
    await screen.findByText('Friday Futsal')
    fireEvent.click(screen.getByRole('radio', { name: 'Bob' }))
    fireEvent.click(screen.getByRole('button', { name: 'Going' }))

    expect(
      await screen.findByText("That session has started — here's the next one."),
    ).toBeTruthy()
    await waitFor(() => expect(getGroupPublic).toHaveBeenCalledTimes(2))
  })

  it('rolls back only the failed answer, leaving a concurrent refetch\'s other changes intact', async () => {
    const original = buildGroup()
    const refetched = buildGroup({
      sessions: [
        {
          ...original.sessions[0],
          answers: [{ member_id: 'm1', status: 'going', note: 'Updated note' }],
        },
      ],
    })

    vi.mocked(getGroupPublic)
      .mockResolvedValueOnce({ ok: true, data: original })
      .mockResolvedValueOnce({ ok: true, data: refetched })

    let resolveSubmit!: (value: Result<unknown>) => void
    vi.mocked(submitResponse).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSubmit = resolve as (value: Result<unknown>) => void
      }) as ReturnType<typeof submitResponse>,
    )

    renderPage()
    await screen.findByText('Friday Futsal')

    // Bob answers Going — optimistic update adds him to the Going group immediately.
    fireEvent.click(screen.getByRole('radio', { name: 'Bob' }))
    fireEvent.click(screen.getByRole('button', { name: 'Going' }))
    await screen.findByText('Going (2)')

    // While that submit is still in flight, the tab regains focus and a refetch lands — it
    // brings Alice's updated note (no mention of Bob yet, since his submit hasn't landed).
    fireEvent(window, new Event('focus'))
    await waitFor(() => expect(getGroupPublic).toHaveBeenCalledTimes(2))
    await screen.findByText(/Updated note/)

    // Now Bob's original submit fails. The rollback must undo only Bob's answer, not the
    // Alice note the refetch just brought in.
    resolveSubmit({ ok: false, error: 'network' })

    expect(
      await screen.findByText("Couldn't save your answer. Try again."),
    ).toBeTruthy()
    await screen.findByText('No reply yet (1)')
    expect(screen.getByText(/Updated note/)).toBeTruthy()
  })
})
