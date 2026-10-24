import { describe, expect, it } from 'vitest'
import { matchRoute } from './router.ts'

describe('matchRoute', () => {
  it('matches the home route', () => {
    expect(matchRoute('#/')).toEqual({ path: '/', params: {} })
  })

  it('matches a share-code route and extracts the param', () => {
    expect(matchRoute('#/g/ABC')).toEqual({ path: '/g/:shareCode', params: { shareCode: 'ABC' } })
  })

  it('matches admin tab sub-routes', () => {
    expect(matchRoute('#/a/checkin')).toEqual({ path: '/a/checkin', params: {} })
  })

  it('matches /a with no tab', () => {
    expect(matchRoute('#/a')).toEqual({ path: '/a', params: {} })
  })

  it('falls back to / for unknown routes', () => {
    expect(matchRoute('#/nope')).toEqual({ path: '/', params: {} })
  })

  it('falls back to / for an empty hash', () => {
    expect(matchRoute('')).toEqual({ path: '/', params: {} })
  })

  it('ignores a trailing slash', () => {
    expect(matchRoute('#/new/')).toEqual({ path: '/new', params: {} })
  })
})
