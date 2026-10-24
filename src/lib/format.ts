// Session scheduling display helpers. Everything here is computed in the group's timezone (via
// Intl), never the browser's local zone or raw UTC — "today"/"tomorrow" and the printed clock
// time must match what the member sees on their own wall clock in that place.

const DAY_MS = 24 * 60 * 60 * 1000

/** 'YYYY-MM-DD' for the given instant, as a wall-clock date in `tz`. */
function ymdInTz(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const byType: Record<string, string> = {}
  for (const part of parts) byType[part.type] = part.value
  return `${byType.year}-${byType.month}-${byType.day}`
}

function utcMidnight(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** Whole calendar days from `from` to `to`, counted as wall-clock dates in `tz` (so DST and
 * offset changes never shift the day count by themselves). */
function daysBetween(from: Date, to: Date, tz: string): number {
  const fromMidnight = utcMidnight(ymdInTz(from, tz))
  const toMidnight = utcMidnight(ymdInTz(to, tz))
  return Math.round((toMidnight - fromMidnight) / DAY_MS)
}

function namedParts(date: Date, tz: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, ...options }).formatToParts(date)
  const byType: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') byType[part.type] = part.value
  }
  return byType
}

/** 'today' | 'tomorrow' | the full weekday name (e.g. 'Friday'), relative to `now`, all compared
 * as wall-clock dates in `tz`. */
export function relativeDayLabel(date: Date, tz: string, now: Date): string {
  const diff = daysBetween(now, date, tz)
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(date)
}

/** e.g. "Fri 31 Oct · 7:00 PM". The year is appended only when it differs from `now`'s year in
 * `tz`, since members almost never need the year for "this/next week" style sessions. */
export function formatSessionWhen(startsAtIso: string, tz: string, now: Date): string {
  const date = new Date(startsAtIso)
  const sameYear = ymdInTz(date, tz).slice(0, 4) === ymdInTz(now, tz).slice(0, 4)

  const dateParts = namedParts(date, tz, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: sameYear ? undefined : 'numeric',
  })
  const datePart = sameYear
    ? `${dateParts.weekday} ${dateParts.day} ${dateParts.month}`
    : `${dateParts.weekday} ${dateParts.day} ${dateParts.month} ${dateParts.year}`

  const timePart = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)

  return `${datePart} · ${timePart}`
}

/** "Are you coming today/tomorrow/this <weekday>?" from a `relativeDayLabel` result. */
export function sessionHeadline(label: string): string {
  if (label === 'today' || label === 'tomorrow') return `Are you coming ${label}?`
  return `Are you coming this ${label}?`
}

/** e.g. "Fri 24 Oct" for a plain 'YYYY-MM-DD' occurrence date (Insights charts/tables). The date's
 * own calendar components decide the weekday — formatted in UTC so the host's local timezone can
 * never shift it by a day, matching how `computeInsights` reads the same date strings. */
export function formatInsightDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).formatToParts(date)
  const byType: Record<string, string> = {}
  for (const part of parts) {
    if (part.type !== 'literal') byType[part.type] = part.value
  }
  return `${byType.weekday} ${byType.day} ${byType.month}`
}

/** "Answers arrive ~X h before start" (or "~X days before start" at 48h+). `null` means hide it. */
export function formatAvgLeadTime(avgLeadHours: number | null): string | null {
  if (avgLeadHours == null) return null
  if (avgLeadHours >= 48) {
    const days = Math.round(avgLeadHours / 24)
    return `Answers arrive ~${days} day${days === 1 ? '' : 's'} before start`
  }
  const hours = Math.round(avgLeadHours)
  return `Answers arrive ~${hours} h before start`
}
