import { describe, expect, it } from 'vitest'
import { computeInsights } from './insights.ts'
import { buildHistory, memberAlice, memberBob, memberCara, memberDee, now, seriesId } from './fixtures.ts'
import type { History } from './types.ts'

const emptyHistory: History = { members: [], events: [], occurrences: [], responses: [], attendance: [] }

function byId(insights: ReturnType<typeof computeInsights>, memberId: string) {
  const stat = insights.members.find((m) => m.memberId === memberId)
  if (!stat) throw new Error(`no member stat for ${memberId}`)
  return stat
}

describe('computeInsights', () => {
  it('counts only past non-skipped sessions', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    expect(insights.sessions.length).toBe(6)
    expect(insights.sessions.map((s) => s.date)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ])
    expect(insights.sessions.map((s) => s.checked)).toEqual([true, true, true, false, false, false])
  })

  it('respects join/leave window', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    expect(byId(insights, memberAlice.id).expected).toBe(6)
    expect(byId(insights, memberBob.id).expected).toBe(4)
    expect(byId(insights, memberCara.id).expected).toBe(4)
    expect(byId(insights, memberDee.id).expected).toBe(6)
  })

  it('uses attendance for checked sessions and answers for unchecked sessions', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    const [s1, s2, s3, s4, s5, s6] = insights.sessions

    // Checked sessions: came follows attendance, not the answer.
    expect(s1).toMatchObject({ expected: 3, came: 3, cant: 0, noReply: 0 })
    expect(s2).toMatchObject({ expected: 3, came: 3, cant: 0, noReply: 0 })
    // 09-21: Bob said going but didn't attend; Cara said can't but attended.
    expect(s3).toMatchObject({ expected: 4, came: 3, cant: 1, noReply: 0 })

    // Unchecked sessions: came follows the "going" answer.
    expect(s4).toMatchObject({ expected: 4, came: 3, cant: 1, noReply: 0 })
    expect(s5).toMatchObject({ expected: 3, came: 2, cant: 1, noReply: 0 })
    expect(s6).toMatchObject({ expected: 3, came: 2, cant: 0, noReply: 1 })
  })

  it('ignores responses and attendance stranded on a date with no matching occurrence', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    // The stranded 2026-08-03 rows must not create a phantom session or inflate any count.
    expect(insights.sessions.find((s) => s.date === '2026-08-03')).toBeUndefined()
    const total = insights.sessions.reduce((n, s) => n + s.came, 0)
    expect(total).toBe(3 + 3 + 3 + 3 + 2 + 2)
  })

  it('computes streaks', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    expect(byId(insights, memberAlice.id)).toMatchObject({ currentStreak: 6, longestStreak: 6 })
    expect(byId(insights, memberBob.id)).toMatchObject({ currentStreak: 1, longestStreak: 1 })
    expect(byId(insights, memberCara.id)).toMatchObject({ currentStreak: 4, longestStreak: 4 })
    expect(byId(insights, memberDee.id)).toMatchObject({ currentStreak: 0, longestStreak: 3 })
  })

  it('computes reliability, no-shows and walk-ins', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    const bob = byId(insights, memberBob.id)
    expect(bob.noShows).toBe(1)
    expect(bob.walkIns).toBe(0)
    expect(bob.saidGoing).toBe(3)
    expect(bob.reliabilityPct).toBe(67)

    const cara = byId(insights, memberCara.id)
    expect(cara.noShows).toBe(0)
    expect(cara.walkIns).toBe(1)
    expect(cara.saidGoing).toBe(3)
    expect(cara.reliabilityPct).toBe(100)

    const dee = byId(insights, memberDee.id)
    expect(dee.noReplyPct).toBe(17)
  })

  it('respects lastN, limiting sessions and per-member stats to the newest N', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: 2, now })
    expect(insights.sessions.map((s) => s.date)).toEqual(['2026-10-05', '2026-10-12'])
    // Cara left before both of the last 2 sessions, so she is expected in neither.
    expect(byId(insights, memberCara.id).expected).toBe(0)
    expect(byId(insights, memberCara.id).pct).toBe(0)
    expect(byId(insights, memberCara.id).reliabilityPct).toBeNull()
    // Bob is expected in both of the last sessions (10-05 cant, 10-12 going).
    expect(byId(insights, memberBob.id).expected).toBe(2)
    expect(byId(insights, memberBob.id).came).toBe(1)
  })

  it('returns zeros for an empty history', () => {
    const insights = computeInsights(emptyHistory, seriesId, { lastN: null, now })
    expect(insights.sessions).toEqual([])
    expect(insights.avgAttendancePct).toBe(0)
    expect(insights.avgHeadcount).toBe(0)
    expect(insights.members).toEqual([])
    expect(insights.byWeekday).toEqual([])
    expect(insights.avgLeadHours).toBeNull()
    expect(insights.uncheckedCount).toBe(0)
  })

  it('aggregates average attendance, headcount, weekday breakdown, lead time and unchecked count', () => {
    const insights = computeInsights(buildHistory(), seriesId, { lastN: null, now })
    expect(insights.avgAttendancePct).toBe(81)
    expect(insights.avgHeadcount).toBeCloseTo(16 / 6, 5)
    expect(insights.byWeekday).toEqual([{ weekday: 1, pct: 81, sessions: 6 }])
    expect(insights.avgLeadHours).not.toBeNull()
    expect(insights.avgLeadHours as number).toBeCloseTo(55.473684210526315, 5)
    expect(insights.uncheckedCount).toBe(3)
  })

  it('leaves sessions nobody was expected at out of the percentage averages', () => {
    const h = buildHistory()
    // Before anyone joined (members joined 2026-08-01 or later): expected === 0.
    h.occurrences.push(
      { event_id: 'event-practice', series_id: seriesId, occurrence_date: '2026-07-27', starts_at: '2026-07-27T18:00:00Z', skipped: false, checked: false },
      { event_id: 'event-practice', series_id: seriesId, occurrence_date: '2026-07-28', starts_at: '2026-07-28T18:00:00Z', skipped: false, checked: false },
    )
    const insights = computeInsights(h, seriesId, { lastN: null, now })
    expect(insights.sessions.length).toBe(8)
    expect(insights.sessions.slice(0, 2).map((s) => s.expected)).toEqual([0, 0])
    expect(insights.avgAttendancePct).toBe(81)
    expect(insights.byWeekday).toEqual([{ weekday: 1, pct: 81, sessions: 6 }])
  })
})
