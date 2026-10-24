// Minimal hash router. No dependency — GitHub Pages serves one index.html, so `#/...` routes
// never hit the server and deep links just work.
import { useSyncExternalStore } from 'react'

export interface RouteMatch {
  path: string
  params: Record<string, string>
}

// Every route this app knows about, most specific first within equal segment counts doesn't
// matter here since every pattern has a distinct literal/param shape.
const ROUTE_PATTERNS = [
  '/',
  '/new',
  '/created',
  '/g/:shareCode',
  '/a',
  '/a/week',
  '/a/checkin',
  '/a/insights',
  '/a/events',
  '/a/members',
  '/a/settings',
] as const

const NOT_FOUND: RouteMatch = { path: '/', params: {} }

function normalizePath(hash: string): string {
  let path = hash.startsWith('#') ? hash.slice(1) : hash
  if (!path.startsWith('/')) path = `/${path}`
  const queryIndex = path.indexOf('?')
  if (queryIndex >= 0) path = path.slice(0, queryIndex)
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path === '' ? '/' : path
}

/** Pure: parses a location.hash value into a known route pattern + its params. */
export function matchRoute(hash: string): RouteMatch {
  const path = normalizePath(hash)
  const pathSegments = path.split('/').filter(Boolean)

  for (const pattern of ROUTE_PATTERNS) {
    const patternSegments = pattern.split('/').filter(Boolean)
    if (patternSegments.length !== pathSegments.length) continue

    const params: Record<string, string> = {}
    let matched = true
    for (let i = 0; i < patternSegments.length; i++) {
      const patternSegment = patternSegments[i]
      const pathSegment = pathSegments[i]
      if (patternSegment.startsWith(':')) {
        params[patternSegment.slice(1)] = decodeURIComponent(pathSegment)
      } else if (patternSegment !== pathSegment) {
        matched = false
        break
      }
    }
    if (matched) return { path: pattern, params }
  }

  return NOT_FOUND
}

export function navigate(path: string): void {
  const normalized = path.startsWith('/') ? path : `/${path}`
  window.location.hash = normalized
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function getSnapshot(): string {
  return window.location.hash
}

function getServerSnapshot(): string {
  return '#/'
}

export function useRoute(): RouteMatch {
  const hash = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return matchRoute(hash)
}
