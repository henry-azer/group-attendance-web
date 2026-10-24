// Thin, failure-safe wrapper around window.localStorage/sessionStorage. Private browsing, quota
// errors and disabled storage all throw on access — every call here is wrapped in try/catch so a
// storage failure never breaks the app, it just behaves as if nothing were ever saved.

export type StorageArea = 'local' | 'session'

const ADMIN_CODE_KEY = 'ga.admin'

function getStorage(area: StorageArea): Storage {
  return area === 'session' ? window.sessionStorage : window.localStorage
}

export function safeGet(key: string, area: StorageArea = 'local'): string | null {
  try {
    return getStorage(area).getItem(key)
  } catch {
    return null
  }
}

export function safeSet(key: string, value: string, area: StorageArea = 'local'): boolean {
  try {
    getStorage(area).setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemove(key: string, area: StorageArea = 'local'): void {
  try {
    getStorage(area).removeItem(key)
  } catch {
    // ignore — nothing to clean up if storage is unavailable
  }
}

// Admin code: always kept in sessionStorage; mirrored to localStorage only when the admin ticked
// "Remember on this device". Never put in the URL.
export function getAdminCode(): string | null {
  return safeGet(ADMIN_CODE_KEY, 'session') ?? safeGet(ADMIN_CODE_KEY, 'local')
}

export function setAdminCode(code: string, remember: boolean): void {
  safeSet(ADMIN_CODE_KEY, code, 'session')
  if (remember) {
    safeSet(ADMIN_CODE_KEY, code, 'local')
  } else {
    safeRemove(ADMIN_CODE_KEY, 'local')
  }
}

export function clearAdminCode(): void {
  safeRemove(ADMIN_CODE_KEY, 'session')
  safeRemove(ADMIN_CODE_KEY, 'local')
}
