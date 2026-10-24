import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminGroup } from '../../domain/types.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { MembersTab } from './MembersTab.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminUpsertMember: vi.fn(),
  adminDeactivateMember: vi.fn(),
}))
vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
}))
vi.mock('../../lib/storage.ts', () => ({
  clearAdminCode: vi.fn(),
}))

import { adminUpsertMember } from '../../api/rpc.ts'
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
      <MembersTab adminCode="ADMIN1234567890A" group={buildGroup()} onReload={onReload} />
    </ToastProvider>,
  )
  return { onReload }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MembersTab', () => {
  it('refreshes instead of logging out when adminUpsertMember hits a stale not_found', async () => {
    vi.mocked(adminUpsertMember).mockResolvedValueOnce({ ok: false, error: 'not_found' })
    const { onReload } = renderTab()

    fireEvent.change(screen.getByLabelText('Add a member'), { target: { value: 'Dee' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('That item changed — refreshing.')).toBeTruthy()
    await waitFor(() => expect(onReload).toHaveBeenCalled())
    expect(clearAdminCode).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
