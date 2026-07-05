import { describe, it, expect, vi } from 'vitest'
import { waitForConfirmation, resolveConfirmation } from './confirmation-registry'

describe('confirmation-registry', () => {
  it('resolves the waiting promise with the approved value', async () => {
    const promise = waitForConfirmation('id-1')
    const found = resolveConfirmation('id-1', true)
    expect(found).toBe(true)
    await expect(promise).resolves.toBe(true)
  })

  it('resolves false and cleans up when nobody responds before the timeout', async () => {
    vi.useFakeTimers()
    const promise = waitForConfirmation('id-2', 1000)
    vi.advanceTimersByTime(1000)
    await expect(promise).resolves.toBe(false)
    // The entry is gone — a late resolve attempt finds nothing.
    expect(resolveConfirmation('id-2', true)).toBe(false)
    vi.useRealTimers()
  })

  it('returns false when resolving an unknown or already-resolved confirmation id', () => {
    expect(resolveConfirmation('does-not-exist', true)).toBe(false)
  })

  it('only resolves once — a second resolve call is a no-op', async () => {
    const promise = waitForConfirmation('id-3')
    resolveConfirmation('id-3', true)
    const secondAttempt = resolveConfirmation('id-3', false)
    expect(secondAttempt).toBe(false)
    await expect(promise).resolves.toBe(true)
  })
})
