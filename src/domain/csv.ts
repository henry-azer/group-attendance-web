import type { History } from './types.ts'

const HEADER = 'event,date,member,answer,note,came'

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function attendanceKey(eventId: string, occurrenceDate: string, memberId: string): string {
  return `${eventId}\u0000${occurrenceDate}\u0000${memberId}`
}

// One row per response: event title, date, member name, answer, note, and whether the admin
// marked them as having come (blank when the session is not yet checked).
export function toCsv(h: History): string {
  const eventById = new Map(h.events.map((e) => [e.id, e]))
  const memberById = new Map(h.members.map((m) => [m.id, m]))

  const attendedByKey = new Map<string, boolean>()
  for (const a of h.attendance) {
    attendedByKey.set(attendanceKey(a.event_id, a.occurrence_date, a.member_id), a.attended)
  }

  const lines = [HEADER]
  for (const r of h.responses) {
    const eventTitle = eventById.get(r.event_id)?.title ?? ''
    const memberName = memberById.get(r.member_id)?.name ?? ''
    const attended = attendedByKey.get(attendanceKey(r.event_id, r.occurrence_date, r.member_id))
    const came = attended === undefined ? '' : attended ? 'true' : 'false'
    const row = [eventTitle, r.occurrence_date, memberName, r.status, r.note ?? '', came].map(escapeCsv).join(',')
    lines.push(row)
  }
  return lines.join('\n')
}
