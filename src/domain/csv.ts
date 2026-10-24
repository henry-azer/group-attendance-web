import type { History } from './types.ts'

const HEADER = 'event,date,member,answer,note,came'

// A leading =, +, -, @, tab or CR makes some spreadsheet apps (Excel, Sheets) evaluate the
// cell as a formula when the CSV is opened. Notes, member names and event titles all come
// from people using the share link, so they're untrusted; prefixing with a single quote
// forces the cell to be read as plain text instead (OWASP CSV-injection mitigation).
const FORMULA_LEADING_CHAR = /^[=+\-@\t\r]/

function escapeCsv(value: string): string {
  const safe = FORMULA_LEADING_CHAR.test(value) ? `'${value}` : value
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`
  }
  return safe
}

function occurrenceKey(eventId: string, occurrenceDate: string): string {
  return `${eventId}\u0000${occurrenceDate}`
}

function attendanceKey(eventId: string, occurrenceDate: string, memberId: string): string {
  return `${eventId}\u0000${occurrenceDate}\u0000${memberId}`
}

// One row per response: event title, date, member name, answer, note, and whether the admin
// marked them as having come (blank when the session is not yet checked).
//
// Scope matches computeInsights: a response/attendance row only counts when its
// (event_id, occurrence_date) matches a known, non-skipped occurrence in history.occurrences.
// This drops rows stranded by schedule versioning (no matching occurrence at all) and rows
// for occurrences the admin has since skipped.
export function toCsv(h: History): string {
  const eventById = new Map(h.events.map((e) => [e.id, e]))
  const memberById = new Map(h.members.map((m) => [m.id, m]))

  const validOccurrenceKeys = new Set(
    h.occurrences.filter((o) => !o.skipped).map((o) => occurrenceKey(o.event_id, o.occurrence_date)),
  )

  const attendedByKey = new Map<string, boolean>()
  for (const a of h.attendance) {
    if (!validOccurrenceKeys.has(occurrenceKey(a.event_id, a.occurrence_date))) continue
    attendedByKey.set(attendanceKey(a.event_id, a.occurrence_date, a.member_id), a.attended)
  }

  const lines = [HEADER]
  for (const r of h.responses) {
    if (!validOccurrenceKeys.has(occurrenceKey(r.event_id, r.occurrence_date))) continue
    const eventTitle = eventById.get(r.event_id)?.title ?? ''
    const memberName = memberById.get(r.member_id)?.name ?? ''
    const attended = attendedByKey.get(attendanceKey(r.event_id, r.occurrence_date, r.member_id))
    const came = attended === undefined ? '' : attended ? 'true' : 'false'
    const row = [eventTitle, r.occurrence_date, memberName, r.status, r.note ?? '', came].map(escapeCsv).join(',')
    lines.push(row)
  }
  return lines.join('\n')
}
