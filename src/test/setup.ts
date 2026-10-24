// Global vitest setup (wired via `test.setupFiles` in vite.config.ts). Runs `cleanup()` after
// every test so each file doesn't have to import and call it itself.
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})
