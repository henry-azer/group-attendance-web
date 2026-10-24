import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminGroup } from '../../domain/types.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { WeekTab } from './WeekTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminSetResponse: vi.fn(),
  adminSkipOccurrence: vi.fn(),
}))
vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../../lib/storage.ts', () => ({
  clearAdminCode: vi.fn(),
}))

import { adminSetResponse } from '../../api/rpc.ts'
import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'

function buildGroup(): AdminGroup {
  return {
    id: 'g1',
    name: 'Friday Futsal',
    timezone: 'Africa/Cairo',
    share_code: 'SHARE123456',
    members: [{ id: 'm1', name: 'Alice', active: true, joined_at: '2026-01-01T00:00:00Z', left_at: null }],
    events: [],
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
        answers: [],
      },
    ],
  }
}

function renderTab() {
  const onReload = vi.fn().mockResolvedValue(undefined)
  render(
    <ToastProvider>
      <WeekTab adminCode="ADMIN1234567890A" group={buildGroup()} onReload={onReload} />
    </ToastProvider>,
  )
  return { onReload }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WeekTab', () => {
  it('refreshes instead of logging out when adminSetResponse hits a stale not_found', async () => {
    vi.mocked(adminSetResponse).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    const { onReload } = renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Going' }))

    expect(await screen.findByText('That item changed — refreshing.')).toBeTruthy()
    await waitFor(() => expect(onReload).toHaveBeenCalled())
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
