import { describe, it, expect } from 'vitest'
import { acquireLock, releaseLock } from './run-lock'

describe('run-lock', () => {
  it('acquires a lock when none is held', () => {
    expect(acquireLock('key-1')).toEqual({ acquired: true })
  })

  it('refuses to acquire a lock already held', () => {
    acquireLock('key-2')
    expect(acquireLock('key-2')).toEqual({ acquired: false })
  })

  it('allows re-acquiring immediately after release', () => {
    acquireLock('key-3')
    releaseLock('key-3')
    expect(acquireLock('key-3')).toEqual({ acquired: true })
  })

  it('keeps locks for different keys independent', () => {
    acquireLock('key-4a')
    expect(acquireLock('key-4b')).toEqual({ acquired: true })
  })

  it('releasing a key that was never locked is a no-op', () => {
    expect(() => releaseLock('key-never-locked')).not.toThrow()
  })
})
