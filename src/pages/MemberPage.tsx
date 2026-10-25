// #/g/:shareCode — the screen members actually use: open the link from WhatsApp, pick a name,
// tap Going/Can't. No sign-in, nothing to install.
import { useCallback, useEffect, useState } from 'react'
import { getGroupPublic, submitResponse } from '../api/rpc.ts'
import { type ApiError } from '../api/errors.ts'
import { NamePicker } from '../components/NamePicker.tsx'
import { SessionCard } from '../components/SessionCard.tsx'
import type { Answer, PublicGroup, Session, Status } from '../domain/types.ts'
import { safeGet, safeRemove, safeSet } from '../lib/storage.ts'
import { EmptyState, Spinner, useToast } from '../ui/index.ts'

export interface MemberPageProps {
  shareCode: string
}

type LoadStatus = 'loading' | 'not_found' | 'error' | 'ready'

function memberStorageKey(shareCode: string): string {
  return `ga.member.${shareCode}`
}

function upsertAnswer(answers: Answer[], memberId: string, status: Status, note: string | null): Answer[] {
  const next = answers.filter((a) => a.member_id !== memberId)
  next.push({ member_id: memberId, status, note })
  return next
}

function withOptimisticAnswer(
  group: PublicGroup,
  eventId: string,
  memberId: string,
  status: Status,
  note: string | null,
): PublicGroup {
  return {
    ...group,
    sessions: group.sessions.map((session) =>
      session.event.id === eventId
        ? { ...session, answers: upsertAnswer(session.answers, memberId, status, note) }
        : session,
    ),
  }
}

function withServerSession(group: PublicGroup, updated: Session): PublicGroup {
  return {
    ...group,
    sessions: group.sessions.map((session) => (session.event.id === updated.event.id ? updated : session)),
  }
}

// Undoes only this one member's answer for this one session — restoring their previous answer
// (or removing it if they had none) — rather than reverting the whole group to a snapshot taken
// at dispatch time. A wholesale revert would clobber anything a focus-triggered refetch brought
// in while the submit was in flight (another member's answer, a changed note, a new occurrence).
function withRolledBackAnswer(
  group: PublicGroup,
  eventId: string,
  memberId: string,
  previousAnswer: Answer | undefined,
): PublicGroup {
  return {
    ...group,
    sessions: group.sessions.map((session) => {
      if (session.event.id !== eventId) return session
      const withoutMember = session.answers.filter((a) => a.member_id !== memberId)
      return { ...session, answers: previousAnswer ? [...withoutMember, previousAnswer] : withoutMember }
    }),
  }
}

// Soonest-first; events with no upcoming occurrence (starts_at null) sort last.
function sortedSessions(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return 0
    if (!a.starts_at) return 1
    if (!b.starts_at) return -1
    return a.starts_at.localeCompare(b.starts_at)
  })
}

export function MemberPage({ shareCode }: MemberPageProps) {
  const { showToast } = useToast()
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [group, setGroup] = useState<PublicGroup | null>(null)
  const [meId, setMeId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<ApiError | null>(null)

  const load = useCallback(async () => {
    const result = await getGroupPublic(shareCode)
    if (!result.ok) {
      setLoadError(result.error)
      setStatus(result.error === 'not_found' ? 'not_found' : 'error')
      return
    }

    const data = result.data
    setGroup(data)
    setStatus('ready')

    // A remembered (or currently picked) member who is no longer active loses their name —
    // the group's member list already excludes inactive members.
    const key = memberStorageKey(shareCode)
    setMeId((current) => {
      const candidate = current ?? safeGet(key)
      if (candidate && data.members.some((m) => m.id === candidate)) return candidate
      if (candidate) safeRemove(key)
      return null
    })
  }, [shareCode])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    function onFocus() {
      load()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  function handleSelectMember(id: string) {
    setMeId(id)
    safeSet(memberStorageKey(shareCode), id)
  }

  async function handleAnswer(session: Session, nextStatus: Status, note: string) {
    if (!meId) {
      showToast('Pick your name first.', 'error')
      return
    }
    if (!session.occurrence_date) return

    const noteValue = note || null
    const eventId = session.event.id
    const previousAnswer = session.answers.find((a) => a.member_id === meId)
    setGroup((current) =>
      current ? withOptimisticAnswer(current, eventId, meId, nextStatus, noteValue) : current,
    )

    const result = await submitResponse({
      share: shareCode,
      event: eventId,
      date: session.occurrence_date,
      member: meId,
      status: nextStatus,
      note: noteValue,
    })

    if (!result.ok) {
      if (result.error === 'session_closed') {
        showToast("That session has started — here's the next one.", 'info')
        await load()
      } else {
        setGroup((current) =>
          current ? withRolledBackAnswer(current, eventId, meId, previousAnswer) : current,
        )
        showToast("Couldn't save your answer. Try again.", 'error')
      }
      return
    }

    setGroup((current) => (current ? withServerSession(current, result.data) : current))
  }

  if (status === 'loading') {
    return (
      <div className="container screen member-page__loading">
        <Spinner label="Loading group" />
      </div>
    )
  }

  if (status === 'not_found') {
    return (
      <div className="container screen">
        <EmptyState
          title="This link doesn't match any group"
          description="Double-check the link, or ask whoever shared it with you for a new one."
        />
      </div>
    )
  }

  if (status === 'error' || !group) {
    return (
      <div className="container screen">
        <EmptyState
          title="Couldn't load this group"
          description={
            loadError === 'network'
              ? 'Check your connection and reload the page.'
              : 'Something went wrong on our side. Reload the page to try again.'
          }
        />
      </div>
    )
  }

  const sessions = sortedSessions(group.sessions)
  const hasUpcoming = sessions.some((session) => session.occurrence_date)
  const me = meId ? group.members.find((m) => m.id === meId) : undefined

  return (
    <div className="container screen member-page">
      <header className="member-page__header">
        <h1>{group.name}</h1>
        <p className="member-page__sub">
          {group.members.length === 1 ? '1 member' : `${group.members.length} members`}
          {me ? (
            <>
              {' · '}answering as <strong>{me.name}</strong>
            </>
          ) : null}
        </p>
      </header>

      <section className="who-card" aria-labelledby="name-picker-label">
        <p id="name-picker-label" className="member-page__name-picker-label">
          Who are you?
        </p>
        <NamePicker
          members={group.members}
          selectedId={meId}
          onSelect={handleSelectMember}
          labelId="name-picker-label"
        />
      </section>

      {!hasUpcoming ? (
        <EmptyState
          title="No upcoming session"
          description="Check back once the organizer schedules one."
        />
      ) : (
        <div className="member-page__sessions">
          {sessions.map((session) => (
            <SessionCard
              key={session.event.id}
              session={session}
              members={group.members}
              meId={meId}
              tz={group.timezone}
              onAnswer={(nextStatus, note) => handleAnswer(session, nextStatus, note)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
