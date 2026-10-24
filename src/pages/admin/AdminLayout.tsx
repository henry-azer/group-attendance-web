// #/a and its tab sub-routes. Owns the one admin_get_group fetch and hands the result down to
// whichever tab is active; `#/a` itself (no sub-route) defaults to "This week".
import { useCallback, useEffect, useState } from 'react'
import { adminGetGroup } from '../../api/rpc.ts'
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

const TABS: { key: TabKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'checkin', label: 'Check-in' },
  { key: 'insights', label: 'Insights' },
  { key: 'events', label: 'Events' },
  { key: 'members', label: 'Members' },
  { key: 'settings', label: 'Settings' },
]

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

  const load = useCallback(async () => {
    if (!adminCode) return
    const result = await adminGetGroup(adminCode)
    if (!result.ok) {
      if (handleAdminNotFound(result.error, showToast)) return
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
            {t.label}
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
            description="Check your connection and try again."
            action={<Button onClick={load}>Retry</Button>}
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
