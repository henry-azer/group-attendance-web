import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminGroup } from '../../domain/types.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { EventsTab } from './EventsTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminUpsertEvent: vi.fn(),
  adminEndEvent: vi.fn(),
}))
vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../../lib/storage.ts', () => ({
  clearAdminCode: vi.fn(),
}))

import { adminUpsertEvent } from '../../api/rpc.ts'
import { navigate } from '../../lib/router.ts'
import { clearAdminCode } from '../../lib/storage.ts'

function buildGroup(): AdminGroup {
  return {
    id: 'g1',
    name: 'Friday Futsal',
    timezone: 'Africa/Cairo',
    share_code: 'SHARE123456',
    members: [],
    events: [],
    sessions: [],
  }
}

function renderTab() {
  const onReload = vi.fn().mockResolvedValue(undefined)
  render(
    <ToastProvider>
      <EventsTab adminCode="ADMIN1234567890A" group={buildGroup()} onReload={onReload} />
    </ToastProvider>,
  )
  return { onReload }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventsTab', () => {
  it('refreshes instead of logging out when adminUpsertEvent hits a stale not_found', async () => {
    vi.mocked(adminUpsertEvent).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    const { onReload } = renderTab()

    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Practice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }))
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '19:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add event' }))

    expect(await screen.findByText('That item changed — refreshing.')).toBeTruthy()
    await waitFor(() => expect(onReload).toHaveBeenCalled())
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
