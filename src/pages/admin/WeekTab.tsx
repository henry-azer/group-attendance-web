// #/a (default) and #/a/week — each active event's next session, read-only via SessionCard in
// admin mode, plus a compact row per member so the admin can set (or clear) anyone's answer, and
// a "Skip this session" action for holidays/cancellations.
import { useState } from 'react'
import { adminSetResponse, adminSkipOccurrence } from '../../api/rpc.ts'
import { SessionCard } from '../../components/SessionCard.tsx'
import type { AdminGroup, Session, Status } from '../../domain/types.ts'
import { Avatar, Button, Card, EmptyState, TextInput, useToast } from '../../ui/index.ts'
import { handleMutationNotFound } from './adminErrors.ts'

export interface WeekTabProps {
  adminCode: string
  group: AdminGroup
  onReload: () => Promise<void>
}

function sortedSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return 0
    if (!a.starts_at) return 1
    if (!b.starts_at) return -1
    return a.starts_at.localeCompare(b.starts_at)
  })
}

interface AnswerRowProps {
  adminCode: string
  session: Session
  member: { id: string; name: string }
  onReload: () => Promise<void>
}

function AnswerRow({ adminCode, session, member, onReload }: AnswerRowProps) {
  const { showToast } = useToast()
  const [pending, setPending] = useState(false)
  const current = session.answers.find((a) => a.member_id === member.id)

  async function setStatus(status: Status | null) {
    if (pending || !session.occurrence_date) return
    setPending(true)
    const result = await adminSetResponse({
      admin: adminCode,
      event: session.event.id,
      date: session.occurrence_date,
      member: member.id,
      status,
      note: status ? (current?.note ?? null) : null,
    })
    setPending(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't update that answer. Try again.", 'error')
      return
    }
    await onReload()
  }

  return (
    <li className="week-answer-row">
      <span className="week-answer-row__name">
        <Avatar name={member.name} />
        <span>{member.name}</span>
      </span>
      <div className="week-answer-row__options" aria-busy={pending}>
        <button
          type="button"
          aria-pressed={current?.status === 'going'}
          className={['week-answer-row__option', current?.status === 'going' && 'is-going'].filter(Boolean).join(' ')}
          disabled={pending}
          onClick={() => setStatus('going')}
        >
          Going
        </button>
        <button
          type="button"
          aria-pressed={current?.status === 'cant'}
          className={['week-answer-row__option', current?.status === 'cant' && 'is-cant'].filter(Boolean).join(' ')}
          disabled={pending}
          onClick={() => setStatus('cant')}
        >
          Can't
        </button>
        <button
          type="button"
          className="week-answer-row__option week-answer-row__option--clear"
          disabled={pending || !current}
          onClick={() => setStatus(null)}
        >
          Clear
        </button>
      </div>
    </li>
  )
}

interface SessionBlockProps {
  adminCode: string
  session: Session
  activeMembers: { id: string; name: string }[]
  tz: string
  onReload: () => Promise<void>
}

function SessionBlock({ adminCode, session, activeMembers, tz, onReload }: SessionBlockProps) {
  const { showToast } = useToast()
  const [skipping, setSkipping] = useState(false)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function confirmSkip() {
    if (!session.occurrence_date) return
    setSubmitting(true)
    const result = await adminSkipOccurrence({
      admin: adminCode,
      event: session.event.id,
      date: session.occurrence_date,
      reason: reason.trim() || null,
    })
    setSubmitting(false)
    if (!result.ok) {
      if (handleMutationNotFound(result.error, showToast, onReload)) return
      showToast("Couldn't skip that session. Try again.", 'error')
      return
    }
    setSkipping(false)
    setReason('')
    showToast('Session skipped', 'success')
    await onReload()
  }

  return (
    <div className="week-session">
      <SessionCard session={session} members={activeMembers} meId={null} tz={tz} adminMode />

      {session.occurrence_date && (
        <Card className="week-session__admin">
          <h3 className="week-session__heading">Set answers</h3>
          <ul className="week-answer-list">
            {activeMembers.map((member) => (
              <AnswerRow key={member.id} adminCode={adminCode} session={session} member={member} onReload={onReload} />
            ))}
          </ul>

          {skipping ? (
            <div className="week-session__skip-form">
              <TextInput
                aria-label="Reason (optional)"
                placeholder="Reason (optional), e.g. Public holiday"
                maxLength={140}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="week-session__skip-actions">
                <Button variant="secondary" disabled={submitting} onClick={confirmSkip}>
                  {submitting ? 'Skipping…' : 'Confirm skip'}
                </Button>
                <Button variant="ghost" disabled={submitting} onClick={() => setSkipping(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" onClick={() => setSkipping(true)}>
              Skip this session
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}

export function WeekTab({ adminCode, group, onReload }: WeekTabProps) {
  const sessions = sortedSessions(group.sessions)
  const activeMembers = group.members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        description="Add an event from the Events tab to start collecting answers."
      />
    )
  }

  return (
    <div className="week-tab">
      {sessions.map((session) => (
        <SessionBlock
          key={session.event.id}
          adminCode={adminCode}
          session={session}
          activeMembers={activeMembers}
          tz={group.timezone}
          onReload={onReload}
        />
      ))}
    </div>
  )
}
