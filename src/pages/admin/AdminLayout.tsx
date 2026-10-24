// #/a and its tab sub-routes. Owns the one admin_get_group fetch and hands the result down to
// whichever tab is active; `#/a` itself (no sub-route) defaults to "This week".
import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { adminGetGroup } from '../../api/rpc.ts'
import { loadErrorHint, type ApiError } from '../../api/errors.ts'
import type { AdminGroup } from '../../domain/types.ts'
import { navigate, useRoute } from '../../lib/router.ts'
import { getAdminCode } from '../../lib/storage.ts'
import { Button, EmptyState, Spinner, useToast } from '../../ui/index.ts'
import { handleAdminNotFound } from './adminErrors.ts'
import { CheckinTab } from './CheckinTab.tsx'
import { EventsTab } from './EventsTab.tsx'
import { InsightsTab } from './InsightsTab.tsx'
import { MembersTab } from './MembersTab.tsx'
import { SettingsTab } from './SettingsTab.tsx'
import { WeekTab } from './WeekTab.tsx'

type TabKey = 'week' | 'checkin' | 'insights' | 'events' | 'members' | 'settings'

// Short labels so every tab fits on one line at 360px — "This week"/"Members" wrapped to two
// lines in the fixed-width bottom bar (6 tabs in 360px leaves ~56px per tab). The route keys
// (and every tab's own on-page heading) are unchanged; only this nav's visible label is shorter.
const TABS: { key: TabKey; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'insights', label: 'Insights' },
  { key: 'events', label: 'Events' },
  { key: 'members', label: 'People' },
  { key: 'settings', label: 'Settings' },
]

// Small inline line icons, one per tab, shown above the label on the fixed bottom bar only (hidden
// at the ≥720px top-row breakpoint, see admin.css) — stroke-only so they inherit the tab's own
// color (muted at rest, accent when active) with no extra token.
function TabIcon({ tabKey }: { tabKey: TabKey }) {
  const shapes: Record<TabKey, ReactNode> = {
    week: (
      <>
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <line x1="3" y1="8" x2="17" y2="8" />
        <line x1="7" y1="2" x2="7" y2="6" />
        <line x1="13" y1="2" x2="13" y2="6" />
      </>
    ),
    checkin: (
      <>
        <circle cx="10" cy="10" r="7.25" />
        <path d="M7 10.2l2 2 4-4.4" />
      </>
    ),
    insights: (
      <>
        <line x1="4" y1="17" x2="4" y2="11" />
        <line x1="10" y1="17" x2="10" y2="6" />
        <line x1="16" y1="17" x2="16" y2="13" />
      </>
    ),
    events: (
      <>
        <rect x="3" y="4" width="14" height="13" rx="2" />
        <line x1="3" y1="8" x2="17" y2="8" />
        <line x1="10" y1="11" x2="10" y2="15" />
        <line x1="8" y1="13" x2="12" y2="13" />
      </>
    ),
    members: (
      <>
        <circle cx="7.5" cy="7" r="2.75" />
        <path d="M2.5 17c0-3 2.2-5.25 5-5.25s5 2.25 5 5.25" />
        <circle cx="14.5" cy="7.5" r="2" />
        <path d="M12.75 11.9c1.9.4 3.25 2.2 3.25 4.6" />
      </>
    ),
    settings: (
      <>
        <line x1="4" y1="5.5" x2="16" y2="5.5" />
        <circle cx="8" cy="5.5" r="1.75" />
        <line x1="4" y1="10" x2="16" y2="10" />
        <circle cx="13" cy="10" r="1.75" />
        <line x1="4" y1="14.5" x2="16" y2="14.5" />
        <circle cx="9" cy="14.5" r="1.75" />
      </>
    ),
  }

  return (
    <svg
      className="admin-tab__icon"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[tabKey]}
    </svg>
  )
}

function tabFromPath(path: string): TabKey {
  if (path === '/a') return 'week'
  const key = path.slice('/a/'.length)
  return (TABS.some((t) => t.key === key) ? key : 'week') as TabKey
}

export function AdminLayout() {
  const { path } = useRoute()
  const { showToast } = useToast()
  const [adminCode] = useState(() => getAdminCode())
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [group, setGroup] = useState<AdminGroup | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    if (!adminCode) return
    const result = await adminGetGroup(adminCode)
    if (!result.ok) {
      if (handleAdminNotFound(result.error, showToast)) return
      setLoadError(result.error)
      setStatus('error')
      return
    }
    setGroup(result.data)
    setStatus('ready')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCode])

  useEffect(() => {
    if (!adminCode) {
      navigate('/')
      return
    }
    load()
  }, [adminCode, load])

  async function handleRetry() {
    setStatus('loading')
    await load()
  }

  if (!adminCode) {
    return null
  }

  const tab = tabFromPath(path)

  return (
    <div className="admin-shell">
      <div className="container admin-header">
        <h1>{group?.name ?? 'Admin'}</h1>
      </div>

      <nav className="admin-tabs" aria-label="Admin sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={['admin-tab', tab === t.key && 'is-active'].filter(Boolean).join(' ')}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => navigate(t.key === 'week' ? '/a/week' : `/a/${t.key}`)}
          >
            <TabIcon tabKey={t.key} />
            <span className="admin-tab__label">{t.label}</span>
          </button>
        ))}
      </nav>

      <div className="container admin-content">
        {status === 'loading' && (
          <div className="admin-tab-loading">
            <Spinner label="Loading group" />
          </div>
        )}

        {status === 'error' && (
          <EmptyState
            title="Couldn't load this group"
            description={loadErrorHint(loadError)}
            action={<Button onClick={handleRetry}>Retry</Button>}
          />
        )}

        {status === 'ready' && group && (
          <>
            {tab === 'week' && <WeekTab adminCode={adminCode} group={group} onReload={load} />}
            {tab === 'checkin' && <CheckinTab adminCode={adminCode} tz={group.timezone} />}
            {tab === 'insights' && <InsightsTab adminCode={adminCode} groupName={group.name} />}
            {tab === 'events' && <EventsTab adminCode={adminCode} group={group} onReload={load} />}
            {tab === 'members' && <MembersTab adminCode={adminCode} group={group} onReload={load} />}
            {tab === 'settings' && <SettingsTab adminCode={adminCode} group={group} onReload={load} />}
          </>
        )}
      </div>
    </div>
  )
}
