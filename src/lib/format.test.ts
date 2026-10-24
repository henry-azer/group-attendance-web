import { describe, expect, it } from 'vitest'
import { formatSessionWhen, relativeDayLabel, sessionHeadline } from './format.ts'

const TZ = 'Africa/Cairo'

describe('formatSessionWhen', () => {
  it('formats date and time in the group timezone, day before month, no year when it matches now', () => {
    const result = formatSessionWhen('2026-10-30T17:00:00Z', TZ, new Date('2026-10-23T12:00:00Z'))
    expect(result).toBe('Fri 30 Oct · 7:00 PM')
  })

  it('appends the year when it differs from now, in the group timezone', () => {
    const result = formatSessionWhen('2027-01-02T19:00:00Z', TZ, new Date('2026-12-30T10:00:00Z'))
    expect(result).toBe('Sat 2 Jan 2027 · 9:00 PM')
  })

  it('uses the group timezone, not UTC, to render the date and clock time', () => {
    // 23:30 UTC on the 23rd is already the early hours of the 24th in Africa/Cairo.
    const result = formatSessionWhen('2026-10-23T23:30:00Z', TZ, new Date('2026-10-23T12:00:00Z'))
    expect(result).toBe('Sat 24 Oct · 2:30 AM')
  })
})

describe('relativeDayLabel', () => {
  const now = new Date('2026-10-23T10:00:00Z') // 2026-10-23 in Africa/Cairo

  it('returns "today" for a session later the same Cairo day', () => {
    expect(relativeDayLabel(new Date('2026-10-23T18:00:00Z'), TZ, now)).toBe('today')
  })

  it('returns "tomorrow" for a session on the next Cairo day', () => {
    expect(relativeDayLabel(new Date('2026-10-24T10:00:00Z'), TZ, now)).toBe('tomorrow')
  })

  it('returns the weekday name for any other day', () => {
    expect(relativeDayLabel(new Date('2026-10-28T10:00:00Z'), TZ, now)).toBe('Wednesday')
  })

  it('is computed in the group timezone, not UTC', () => {
    // 22:30 UTC on the 23rd is already the 24th (tomorrow) in Africa/Cairo.
    expect(relativeDayLabel(new Date('2026-10-23T22:30:00Z'), TZ, now)).toBe('tomorrow')
  })
})

describe('sessionHeadline', () => {
  it('asks "today" for a today label', () => {
    expect(sessionHeadline('today')).toBe('Are you coming today?')
  })

  it('asks "tomorrow" for a tomorrow label', () => {
    expect(sessionHeadline('tomorrow')).toBe('Are you coming tomorrow?')
  })

  it('asks "this <weekday>" for any other label', () => {
    expect(sessionHeadline('Friday')).toBe('Are you coming this Friday?')
  })
})
