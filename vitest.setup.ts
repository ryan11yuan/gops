import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Bridge: @testing-library/dom's async helpers (waitFor) only advance fake
// timers when a global `jest` with advanceTimersByTime exists. Vitest's
// vi.useFakeTimers() already satisfies the fake-setTimeout check, so exposing
// just this method lets waitFor work under vi.useFakeTimers().
if (!('jest' in globalThis)) {
  ;(globalThis as unknown as { jest: { advanceTimersByTime: (ms: number) => void } }).jest = {
    advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms),
  }
}
