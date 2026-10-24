import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminGroup } from '../../domain/types.ts'
import { ToastProvider } from '../../ui/Toast.tsx'
import { AdminLayout } from './AdminLayout.tsx'

vi.mock('../../api/rpc.ts', () => ({
  adminGetGroup: vi.fn(),
}))
vi.mock('../../lib/router.ts', () => ({
  navigate: vi.fn(),
  useRoute: () => ({ path: '/a/week', params: {} }),
}))
vi.mock('../../lib/storage.ts', () => ({
  getAdminCode: () => 'ADMIN1234567890A',
  clearAdminCode: vi.fn(),
}))

import { adminGetGroup } from '../../api/rpc.ts'

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

function renderLayout() {
  return render(
    <ToastProvider>
      <AdminLayout />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('AdminLayout', () => {
  it('shows every tab label unwrapped with an icon above it', async () => {
    vi.mocked(adminGetGroup).mockResolvedValueOnce({ ok: true, data: buildGroup() })
    renderLayout()

    expect(await screen.findByText('Friday Futsal')).toBeTruthy()
    for (const label of ['Week', 'Check-in', 'Insights', 'Events', 'People', 'Settings']) {
      expect(screen.getByText(label)).toBeTruthy()
    }
  })

  it('Retry goes back to the loading state while refetching', async () => {
    let resolveRetry!: (value: { ok: true; data: AdminGroup }) => void
    vi.mocked(adminGetGroup)
      .mockResolvedValueOnce({ ok: false, error: 'network' })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveRetry = resolve
        }) as ReturnType<typeof adminGetGroup>,
      )
    renderLayout()

    fireEvent.click(await screen.findByRole('button', { name: 'Retry' }))

    // The retry is in flight (its promise hasn't resolved yet) — the error EmptyState must have
    // already been replaced by the loading spinner, not still showing stale error content.
    expect(await screen.findByText('Loading group')).toBeTruthy()
    expect(screen.queryByText("Couldn't load this group")).toBeFalsy()

    resolveRetry({ ok: true, data: buildGroup() })
    await screen.findByText('Friday Futsal')
  })
})
