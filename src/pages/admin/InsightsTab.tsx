// #/a/insights — attendance trends for one event series: headcount over time, per-member
// reliability/streaks, who's slipping, response timing, and a CSV export of every response.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminGetHistory } from '../../api/rpc.ts'
import { loadErrorHint, type ApiError } from '../../api/errors.ts'
import { HeadcountBars } from '../../components/charts/HeadcountBars.tsx'
import { Meter } from '../../components/charts/Meter.tsx'
import { toCsv } from '../../domain/csv.ts'
import { computeInsights } from '../../domain/insights.ts'
import type { Event, History, MemberStat } from '../../domain/types.ts'
import { formatAvgLeadTime } from '../../lib/format.ts'
import { Button, Card, EmptyState, Field, Segmented, Spinner, useToast } from '../../ui/index.ts'
import { handleAdminNotFound } from './adminErrors.ts'

export interface InsightsTabProps {
  adminCode: string
  groupName: string
}

type RangeKey = 'last4' | 'last12' | 'all'

const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'last4', label: 'Last 4' },
  { value: 'last12', label: 'Last 12' },
  { value: 'all', label: 'All' },
]

const RANGE_TO_LAST_N: Record<RangeKey, number | null> = {
  last4: 4,
  last12: 12,
  all: null,
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

type SortKey = 'pct' | 'currentStreak' | 'reliabilityPct' | 'noShows'
type SortDir = 'asc' | 'desc'

const SORT_LABELS: Record<SortKey, string> = {
  pct: 'Attendance %',
  currentStreak: 'Streak',
  reliabilityPct: 'Reliability',
  noShows: 'No-shows',
}

interface SeriesOption {
  id: string
  label: string
}

function seriesOptionsFrom(events: Event[]): SeriesOption[] {
  const bySeries = new Map<string, Event[]>()
  for (const e of events) {
    const list = bySeries.get(e.series_id)
    if (list) list.push(e)
    else bySeries.set(e.series_id, [e])
  }
  return Array.from(bySeries.entries()).map(([id, evs]) => {
    const newest = evs.slice().sort((a, b) => a.starts_on.localeCompare(b.starts_on))[evs.length - 1]
    return { id, label: newest.title }
  })
}

/** The series whose most recent past (non-skipped) occurrence is the most recent of all series —
 * falling back to the first series option when no series has any past occurrence yet. */
function defaultSeriesId(history: History, now: Date, options: SeriesOption[]): string | null {
  if (options.length === 0) return null
  const nowMs = now.getTime()
  let bestId: string | null = null
  let bestStartsAtMs = -Infinity
  for (const occ of history.occurrences) {
    if (occ.skipped) continue
    const startsAtMs = new Date(occ.starts_at).getTime()
    if (startsAtMs > nowMs) continue
    if (startsAtMs > bestStartsAtMs) {
      bestStartsAtMs = startsAtMs
      bestId = occ.series_id
    }
  }
  return bestId ?? options[0].id
}

// `reliabilityPct` is `null` when a member never said "Going" — sort it as -Infinity so those
// members fall to the bottom on a descending sort instead of comparing equal to 0% reliability.
function sortValue(m: MemberStat, key: SortKey): number {
  const v = m[key]
  return v == null ? -Infinity : v
}

function sortMembers(members: MemberStat[], key: SortKey, dir: SortDir): MemberStat[] {
  const sign = dir === 'asc' ? 1 : -1
  return members.slice().sort((a, b) => sign * (sortValue(a, key) - sortValue(b, key)))
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
  return slug || 'group'
}

function downloadCsv(history: History, groupName: string) {
  const csv = toCsv(history)
  // The BOM makes Excel open the file as UTF-8 (names with accents or non-Latin scripts).
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `attendance-${slugify(groupName)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Some browsers start the download asynchronously; revoking right away can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function InsightsTab({ adminCode, groupName }: InsightsTabProps) {
  const { showToast } = useToast()
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [history, setHistory] = useState<History | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)
  const [seriesId, setSeriesId] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('last12')
  const [sortKey, setSortKey] = useState<SortKey>('pct')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const load = useCallback(async () => {
    const result = await adminGetHistory(adminCode)
    if (!result.ok) {
      if (handleAdminNotFound(result.error, showToast)) return
      setLoadError(result.error)
      setStatus('error')
      return
    }
    setHistory(result.data)
    setSeriesId((current) => {
      const options = seriesOptionsFrom(result.data.events)
      if (current && options.some((o) => o.id === current)) return current
      return defaultSeriesId(result.data, new Date(), options)
    })
    setStatus('ready')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCode])

  useEffect(() => {
    load()
  }, [load])

  const options = useMemo(() => (history ? seriesOptionsFrom(history.events) : []), [history])

  const insights = useMemo(() => {
    if (!history || !seriesId) return null
    return computeInsights(history, seriesId, { lastN: RANGE_TO_LAST_N[range], now: new Date() })
  }, [history, seriesId, range])

  if (status === 'loading') {
    return (
      <div className="admin-tab-loading">
        <Spinner label="Loading insights" />
      </div>
    )
  }

  if (status === 'error' || !history) {
    return (
      <EmptyState
        title="Couldn't load insights"
        description={loadErrorHint(loadError)}
        action={
          <Button
            onClick={() => {
              setStatus('loading')
              load()
            }}
          >
            Retry
          </Button>
        }
      />
    )
  }

  if (options.length === 0 || !insights || !seriesId) {
    return (
      <EmptyState
        title="No events yet"
        description="Add an event from the Events tab to start collecting insights."
      />
    )
  }

  const members = insights.members.filter((m) => m.expected > 0)
  const sorted = sortMembers(members, sortKey, sortDir)
  const slipping = members.filter((m) => m.expected >= 4 && m.recentPct <= m.pct - 20)
  const topStreakMember = members.reduce<MemberStat | null>(
    (best, m) => (best == null || m.longestStreak > best.longestStreak ? m : best),
    null,
  )
  const leadTimeLabel = formatAvgLeadTime(insights.avgLeadHours)

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('desc')
  }

  function ariaSortFor(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none'
    return sortDir === 'asc' ? 'ascending' : 'descending'
  }

  return (
    <div className="insights-tab">
      {options.length > 1 && (
        <Field label="Series" htmlFor="insights-series">
          <select
            id="insights-series"
            className="input"
            value={seriesId}
            onChange={(e) => setSeriesId(e.target.value)}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Segmented aria-label="Session range" options={RANGE_OPTIONS} value={range} onChange={setRange} />

      <div className="insights-stats">
        <Card className="insights-stat">
          <Meter value={insights.avgAttendancePct} label={`Average attendance ${insights.avgAttendancePct}%`} />
          <div>
            <p className="insights-stat__value">{insights.avgAttendancePct}%</p>
            <p className="insights-stat__label">Avg attendance</p>
          </div>
        </Card>
        <Card className="insights-stat">
          <p className="insights-stat__value">{Math.round(insights.avgHeadcount * 10) / 10}</p>
          <p className="insights-stat__label">Avg headcount</p>
        </Card>
        <Card className="insights-stat">
          <p className="insights-stat__value">{insights.uncheckedCount}</p>
          <p className="insights-stat__label">Unchecked sessions</p>
        </Card>
        <Card className="insights-stat">
          <p className="insights-stat__value">{topStreakMember ? topStreakMember.longestStreak : 0}</p>
          <p className="insights-stat__label">
            Top streak{topStreakMember && topStreakMember.longestStreak > 0 ? ` · ${topStreakMember.name}` : ''}
          </p>
        </Card>
      </div>

      <Card>
        <h2 className="insights-section-heading">Headcount per session</h2>
        <HeadcountBars sessions={insights.sessions} />
      </Card>

      {insights.byWeekday.length > 1 && (
        <Card>
          <h2 className="insights-section-heading">Attendance by weekday</h2>
          <ul className="insights-weekday-list">
            {insights.byWeekday.map((w) => (
              <li key={w.weekday} className="insights-weekday-row">
                <span>{WEEKDAY_NAMES[w.weekday]}</span>
                <span className="insights-weekday-row__pct">{w.pct}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {leadTimeLabel && (
        <Card>
          <p className="insights-lead-time">{leadTimeLabel}</p>
        </Card>
      )}

      {slipping.length > 0 && (
        <Card>
          <h2 className="insights-section-heading">Slipping</h2>
          <ul className="insights-slipping-list">
            {slipping.map((m) => (
              <li key={m.memberId} className="insights-slipping-row">
                <span className="insights-slipping-row__name">{m.name}</span>
                <span className="insights-slipping-row__detail">
                  was {m.pct}%, now {m.recentPct}%
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="insights-members">
        <h2 className="insights-section-heading">Members</h2>
        {sorted.length === 0 ? (
          <p className="muted">No members expected yet in this range.</p>
        ) : (
          <table className="insights-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                {(['pct', 'currentStreak', 'reliabilityPct', 'noShows'] as SortKey[]).map((key) => (
                  <th key={key} scope="col" aria-sort={ariaSortFor(key)}>
                    <button type="button" className="insights-table__sort" onClick={() => toggleSort(key)}>
                      {SORT_LABELS[key]}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m) => (
                <tr key={m.memberId}>
                  <td data-label="Name">
                    <span>
                      {m.name}
                      {!m.active && <span className="muted"> (left)</span>}
                    </span>
                  </td>
                  <td data-label="Attendance %">{m.pct}%</td>
                  <td data-label="Streak">
                    <span>
                      {m.currentStreak} <span className="muted">(best {m.longestStreak})</span>
                    </span>
                  </td>
                  <td data-label="Reliability">{m.reliabilityPct == null ? '—' : `${m.reliabilityPct}%`}</td>
                  <td data-label="No-shows">{m.noShows}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="insights-export">
        <h2 className="insights-section-heading">Export</h2>
        <p className="muted">Download every response as a CSV file.</p>
        <Button variant="secondary" onClick={() => downloadCsv(history, groupName)}>
          Download CSV
        </Button>
      </Card>
    </div>
  )
}
