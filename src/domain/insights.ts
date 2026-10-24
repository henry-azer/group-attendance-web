import type { History, HistoryAttendance, HistoryOccurrence, HistoryResponse, MemberStat, SeriesInsights, SessionStat } from './types.ts'

function round(x: number): number {
  return Math.round(x)
}

// Weekday (0=Sun..6=Sat) from a 'YYYY-MM-DD' string, with no timezone shifting: the date's
// own calendar components decide the day, independent of the host's local timezone or DST.
function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

function occKey(eventId: string, occurrenceDate: string): string {
  return `${eventId}\u0000${occurrenceDate}`
}

interface ExpandedOccurrence {
  occ: HistoryOccurrence
  expectedIds: Set<string>
  responseByMember: Map<string, HistoryResponse>
  attendedByMember: Map<string, boolean>
}

// Did `memberId` "come" to this occurrence, per the global ruling:
// checked sessions use attendance; unchecked (past) sessions fall back to the "going" answer.
function cameTo(e: ExpandedOccurrence, memberId: string): boolean {
  if (e.occ.checked) return e.attendedByMember.get(memberId) ?? false
  return e.responseByMember.get(memberId)?.status === 'going'
}

export function computeInsights(h: History, seriesId: string, opts: { lastN: number | null; now: Date }): SeriesInsights {
  const nowMs = opts.now.getTime()

  const pastUnskipped = h.occurrences
    .filter((o) => o.series_id === seriesId && !o.skipped && new Date(o.starts_at).getTime() <= nowMs)
    .slice()
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())

  const considered = opts.lastN != null ? pastUnskipped.slice(Math.max(0, pastUnskipped.length - opts.lastN)) : pastUnskipped

  const occKeys = new Set(considered.map((o) => occKey(o.event_id, o.occurrence_date)))

  const responsesByKey = new Map<string, HistoryResponse[]>()
  for (const r of h.responses) {
    const k = occKey(r.event_id, r.occurrence_date)
    if (!occKeys.has(k)) continue
    const list = responsesByKey.get(k)
    if (list) list.push(r)
    else responsesByKey.set(k, [r])
  }

  const attendanceByKey = new Map<string, HistoryAttendance[]>()
  for (const a of h.attendance) {
    const k = occKey(a.event_id, a.occurrence_date)
    if (!occKeys.has(k)) continue
    const list = attendanceByKey.get(k)
    if (list) list.push(a)
    else attendanceByKey.set(k, [a])
  }

  const expanded: ExpandedOccurrence[] = considered.map((occ) => {
    const startsAtMs = new Date(occ.starts_at).getTime()
    const expectedIds = new Set<string>()
    for (const m of h.members) {
      if (new Date(m.joined_at).getTime() > startsAtMs) continue
      if (m.left_at != null && new Date(m.left_at).getTime() <= startsAtMs) continue
      expectedIds.add(m.id)
    }
    const k = occKey(occ.event_id, occ.occurrence_date)
    const responseByMember = new Map<string, HistoryResponse>()
    for (const r of responsesByKey.get(k) ?? []) responseByMember.set(r.member_id, r)
    const attendedByMember = new Map<string, boolean>()
    for (const a of attendanceByKey.get(k) ?? []) attendedByMember.set(a.member_id, a.attended)
    return { occ, expectedIds, responseByMember, attendedByMember }
  })

  const sessions: SessionStat[] = expanded.map((e) => {
    const { occ, expectedIds, responseByMember } = e
    let came = 0
    let cant = 0
    let noReply = 0
    for (const memberId of expectedIds) {
      const resp = responseByMember.get(memberId)
      if (cameTo(e, memberId)) came++
      if (resp?.status === 'cant') cant++
      if (!resp) noReply++
    }
    return {
      date: occ.occurrence_date,
      startsAt: occ.starts_at,
      expected: expectedIds.size,
      came,
      cant,
      noReply,
      checked: occ.checked,
    }
  })

  let avgAttendancePct = 0
  let avgHeadcount = 0
  if (sessions.length > 0) {
    const pctSum = sessions.reduce((sum, s) => sum + (s.expected > 0 ? (s.came / s.expected) * 100 : 0), 0)
    avgAttendancePct = round(pctSum / sessions.length)
    avgHeadcount = sessions.reduce((sum, s) => sum + s.came, 0) / sessions.length
  }

  const weekdayGroups = new Map<number, number[]>()
  for (const s of sessions) {
    const wd = weekdayOf(s.date)
    const pct = s.expected > 0 ? (s.came / s.expected) * 100 : 0
    const list = weekdayGroups.get(wd)
    if (list) list.push(pct)
    else weekdayGroups.set(wd, [pct])
  }
  const byWeekday = Array.from(weekdayGroups.entries())
    .map(([weekday, pcts]) => ({
      weekday,
      pct: round(pcts.reduce((a, b) => a + b, 0) / pcts.length),
      sessions: pcts.length,
    }))
    .sort((a, b) => a.weekday - b.weekday)

  let leadSum = 0
  let leadCount = 0
  for (const occ of considered) {
    const startsAtMs = new Date(occ.starts_at).getTime()
    for (const r of responsesByKey.get(occKey(occ.event_id, occ.occurrence_date)) ?? []) {
      leadSum += (startsAtMs - new Date(r.first_answered_at).getTime()) / 3600000
      leadCount++
    }
  }
  const avgLeadHours = leadCount > 0 ? leadSum / leadCount : null

  const uncheckedCount = sessions.filter((s) => !s.checked).length

  const members: MemberStat[] = h.members.map((m) => {
    const memberSessions = expanded.filter((e) => e.expectedIds.has(m.id))

    const cameFlags: boolean[] = []
    let came = 0
    let noReplyCount = 0
    let saidGoing = 0
    let noShows = 0
    let walkIns = 0

    for (const e of memberSessions) {
      const resp = e.responseByMember.get(m.id)
      const status = resp?.status
      const attended = e.occ.checked ? (e.attendedByMember.get(m.id) ?? false) : false
      const didCome = cameTo(e, m.id)
      cameFlags.push(didCome)
      if (didCome) came++
      if (!resp) noReplyCount++
      if (status === 'going') saidGoing++
      if (status === 'going' && e.occ.checked && !attended) noShows++
      if (e.occ.checked && didCome && status !== 'going') walkIns++
    }

    const expectedCount = memberSessions.length
    const pct = expectedCount > 0 ? round((came / expectedCount) * 100) : 0

    const recentFlags = cameFlags.slice(-4)
    const recentPct = recentFlags.length > 0 ? round((recentFlags.filter(Boolean).length / recentFlags.length) * 100) : 0

    let longestStreak = 0
    let running = 0
    for (const flag of cameFlags) {
      if (flag) {
        running++
        if (running > longestStreak) longestStreak = running
      } else {
        running = 0
      }
    }
    let currentStreak = 0
    for (let i = cameFlags.length - 1; i >= 0; i--) {
      if (cameFlags[i]) currentStreak++
      else break
    }

    const noReplyPct = expectedCount > 0 ? round((noReplyCount / expectedCount) * 100) : 0
    const reliabilityPct = saidGoing > 0 ? round(((saidGoing - noShows) / saidGoing) * 100) : null

    return {
      memberId: m.id,
      name: m.name,
      active: m.active,
      expected: expectedCount,
      came,
      pct,
      recentPct,
      currentStreak,
      longestStreak,
      noReplyPct,
      saidGoing,
      reliabilityPct,
      noShows,
      walkIns,
    }
  })

  return {
    sessions,
    avgAttendancePct,
    avgHeadcount,
    members,
    byWeekday,
    avgLeadHours,
    uncheckedCount,
  }
}
