// #/a/checkin — past sessions, newest first. Opening an unskipped one lists expected members
// (pre-ticked from existing attendance, else from their "Going" answer) plus a collapsed "Others"
// section for walk-ins, and Save replaces that session's attendance. Skipped dates show an Unskip
// action instead of a checklist.
import { useCallback, useEffect, useState } from 'react'
import {
  adminGetHistory,
  adminMarkAttendance,
  adminUnskipOccurrence,
  type AttendanceMark,
} from '../../api/rpc.ts'
import type { AdminMember, History, HistoryAttendance, HistoryOccurrence, HistoryResponse } from '../../domain/types.ts'
import { formatSessionWhen } from '../../lib/format.ts'
import { Button, EmptyState, Spinner, useToast } from '../../ui/index.ts'
import { handleAdminNotFound, handleMutationNotFound } from './adminErrors.ts'

export interface CheckinTabProps {
  adminCode: string
  tz: string
}

function occKey(eventId: string, occurrenceDate: string): string {
  return `${eventId}\u0000${occurrenceDate}`
}

/** Expected at this occurrence: joined on or before it started, and (never left, or left after
 * it started) — independent of whether the member is still active today. */
function expectedMemberIds(members: AdminMember[], startsAt: string): string[] {
  const startsAtMs = new Date(startsAt).getTime()
  return members
    .filter((m) => {
      if (new Date(m.joined_at).getTime() > startsAtMs) return false
      if (m.left_at != null && new Date(m.left_at).getTime() <= startsAtMs) return false
      return true
    })
    .map((m) => m.id)
}

/** Pre-ticked state for a set of member ids at one occurrence: an existing attendance mark wins;
 * otherwise a member who said "Going" starts ticked, everyone else unticked. */
export function initialMarks(
  responses: HistoryResponse[],
  attendance: HistoryAttendance[],
  memberIds: string[],
): Record<string, boolean> {
  const attendedByMember = new Map(attendance.map((a) => [a.member_id, a.attended]))
  const statusByMember = new Map(responses.map((r) => [r.member_id, r.status]))
  const marks: Record<string, boolean> = {}
  for (const id of memberIds) {
    marks[id] = attendedByMember.has(id) ? attendedByMember.get(id)! : statusByMember.get(id) === 'going'
  }
  return marks
}

function pastOccurrencesNewestFirst(history: History): HistoryOccurrence[] {
  const nowMs = Date.now()
  return history.occurrences
    .filter((o) => new Date(o.starts_at).getTime() <= nowMs)
    .slice()
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
}

function memberName(members: AdminMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? 'Someone'
}

export function CheckinTab({ adminCode, tz }: CheckinTabProps) {
  const { showToast } = useToast()
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading')
  const [history, setHistory] = useState<History | null>(null)
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [marks, setMarks] = useState<Record<string, boolean>>({})
  const [othersOpen, setOthersOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [unskipping, setUnskipping] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await adminGetHistory(adminCode)
    if (!result.ok) {
      if (handleAdminNotFound(result.error, showToast)) return
      setStatus('error')
      return
    }
    setHistory(result.data)
    setStatus('ready')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminCode])

  useEffect(() => {
    load()
  }, [load])

  async function handleRetry() {
    setStatus('loading')
    await load()
  }

  if (status === 'loading') {
    return (
      <div className="admin-tab-loading">
        <Spinner label="Loading sessions" />
      </div>
    )
  }

  if (status === 'error' || !history) {
    return (
      <EmptyState
        title="Couldn't load the check-in history"
        description="Check your connection and try again."
        action={<Button onClick={handleRetry}>Retry</Button>}
      />
    )
  }

  const occurrences = pastOccurrencesNewestFirst(history)

  function responsesFor(eventId: string, date: string): HistoryResponse[] {
    return history!.responses.filter((r) => r.event_id === eventId && r.occurrence_date === date)
  }

  function attendanceFor(eventId: string, date: string): HistoryAttendance[] {
    return history!.attendance.filter((a) => a.event_id === eventId && a.occurrence_date === date)
  }

  function openOccurrence(occ: HistoryOccurrence) {
    const key = occKey(occ.event_id, occ.occurrence_date)
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }
    const expectedIds = expectedMemberIds(history!.members, occ.starts_at)
    const otherIds = history!.members.map((m) => m.id).filter((id) => !expectedIds.includes(id))
    const responses = responsesFor(occ.event_id, occ.occurrence_date)
    const attendance = attendanceFor(occ.event_id, occ.occurrence_date)
    setMarks({
      ...initialMarks(responses, attendance, expectedIds),
      ...initialMarks(responses, attendance, otherIds),
    })
    setOthersOpen(false)
    setExpandedKey(key)
  }

  function toggleMark(memberId: string) {
    setMarks((current) => ({ ...current, [memberId]: !current[memberId] }))
  }

  async function handleSave(occ: HistoryOccurrence) {
    const expectedIds = expectedMemberIds(history!.members, occ.starts_at)
    const otherIds = history!.members.map((m) => m.id).filter((id) => !expectedIds.includes(id))
    const markList: AttendanceMark[] = [
      ...expectedIds.map((id) => ({ member_id: id, attended: marks[id] ?? false })),
      ...otherIds.filter((id) => marks[id]).map((id) => ({ member_id: id, attended: true })),
    ]

    setSaving(true)
    const result = await adminMarkAttendance({
      admin: adminCode,
      event: occ.event_id,
      date: occ.occurrence_date,
      marks: markList,
    })
    setSaving(false)

    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, load)) return
      showToast("Couldn't save attendance. Try again.", 'error')
      return
    }

    showToast('Attendance saved', 'success')
    setExpandedKey(null)
    await load()
  }

  async function handleUnskip(occ: HistoryOccurrence) {
    const key = occKey(occ.event_id, occ.occurrence_date)
    setUnskipping(key)
    const result = await adminUnskipOccurrence({ admin: adminCode, event: occ.event_id, date: occ.occurrence_date })
    setUnskipping(null)

    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, load)) return
      showToast("Couldn't unskip that session. Try again.", 'error')
      return
    }
    showToast('Session unskipped', 'success')
    await load()
  }

  if (occurrences.length === 0) {
    return (
      <EmptyState
        title="No past sessions yet"
        description="Once a session's start time passes, it shows up here to check in."
      />
    )
  }

  return (
    <ul className="checkin-list">
      {occurrences.map((occ) => {
        const key = occKey(occ.event_id, occ.occurrence_date)
        const event = history.events.find((e) => e.id === occ.event_id)
        const expanded = expandedKey === key
        const expectedIds = expanded ? expectedMemberIds(history.members, occ.starts_at) : []
        const otherIds = expanded
          ? history.members.map((m) => m.id).filter((id) => !expectedIds.includes(id))
          : []

        return (
          <li key={key} className="checkin-row">
            <button
              type="button"
              className="checkin-row__header"
              onClick={() => (occ.skipped ? undefined : openOccurrence(occ))}
              disabled={occ.skipped}
              aria-expanded={expanded}
            >
              <span className="checkin-row__title">{event?.title ?? 'Session'}</span>
              <span className="checkin-row__when">{formatSessionWhen(occ.starts_at, tz, new Date())}</span>
              {occ.skipped ? (
                <span className="checkin-badge checkin-badge--skipped">Skipped</span>
              ) : !occ.checked ? (
                <span className="checkin-badge checkin-badge--unchecked">Unchecked</span>
              ) : (
                <span className="checkin-badge checkin-badge--checked">Checked</span>
              )}
            </button>

            {occ.skipped && (
              <Button
                variant="ghost"
                disabled={unskipping === key}
                onClick={() => handleUnskip(occ)}
              >
                {unskipping === key ? 'Unskipping…' : 'Unskip'}
              </Button>
            )}

            {expanded && (
              <div className="checkin-detail">
                <h3 className="checkin-detail__heading">Expected ({expectedIds.length})</h3>
                <ul className="checkin-member-list">
                  {expectedIds.map((id) => (
                    <li key={id} className="checkin-member-row">
                      <span>{memberName(history.members, id)}</span>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={Boolean(marks[id])}
                        className={['checkin-member-row__toggle', marks[id] && 'is-active']
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => toggleMark(id)}
                      >
                        {marks[id] ? 'Attended' : 'Absent'}
                      </button>
                    </li>
                  ))}
                </ul>

                {otherIds.length > 0 && (
                  <div className="checkin-others">
                    <button
                      type="button"
                      className="checkin-others__toggle"
                      aria-expanded={othersOpen}
                      onClick={() => setOthersOpen((o) => !o)}
                    >
                      {othersOpen ? 'Hide others' : `Others (${otherIds.length})`}
                    </button>
                    {othersOpen && (
                      <ul className="checkin-member-list">
                        {otherIds.map((id) => (
                          <li key={id} className="checkin-member-row">
                            <span>{memberName(history.members, id)}</span>
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={Boolean(marks[id])}
                              className={['checkin-member-row__toggle', marks[id] && 'is-active']
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => toggleMark(id)}
                            >
                              {marks[id] ? 'Attended' : 'Mark as walk-in'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <Button fullWidth disabled={saving} onClick={() => handleSave(occ)}>
                  {saving ? 'Saving…' : 'Save attendance'}
                </Button>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
