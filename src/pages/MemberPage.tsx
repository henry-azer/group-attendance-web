// #/g/:shareCode — the screen members actually use: open the link from WhatsApp, pick a name,
// tap Going/Can't. No sign-in, nothing to install.
import { useCallback, useEffect, useState } from 'react'
import { getGroupPublic, submitResponse } from '../api/rpc.ts'
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

  const load = useCallback(async () => {
    const result = await getGroupPublic(shareCode)
    if (!result.ok) {
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
    const previousGroup = group
    setGroup((current) =>
      current ? withOptimisticAnswer(current, session.event.id, meId, nextStatus, noteValue) : current,
    )

    const result = await submitResponse({
      share: shareCode,
      event: session.event.id,
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
        setGroup(previousGroup)
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
          description="Check your connection and reload the page."
        />
      </div>
    )
  }

  const sessions = sortedSessions(group.sessions)
  const hasUpcoming = sessions.some((session) => session.occurrence_date)

  return (
    <div className="container screen member-page">
      <h1>{group.name}</h1>

      <NamePicker members={group.members} selectedId={meId} onSelect={handleSelectMember} />

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
