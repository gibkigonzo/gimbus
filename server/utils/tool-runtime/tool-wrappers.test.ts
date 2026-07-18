import { describe, it, expect, beforeEach, vi } from 'vitest'
import { tool } from 'ai'
import { z } from 'zod'
import type { ToolExecutionOptions } from 'ai'

function createFakeStorage() {
  const store = new Map<string, unknown>()
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { store.set(key, value) }
  }
}

let fakeStorage = createFakeStorage()
vi.stubGlobal('useStorage', () => fakeStorage)

const getFailureStreakMock = vi.fn()
vi.mock('../observability/sinks/lessons-sink', () => ({
  getFailureStreak: (...args: unknown[]) => getFailureStreakMock(...args),
  DEGRADED_FAILURE_THRESHOLD: 5
}))

const { withLessons, withConfirmation } = await import('./tool-wrappers')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function makeTool(execute: (args: { x: number }) => Promise<unknown>) {
  return tool({
    description: 'a test tool',
    inputSchema: z.object({ x: z.number() }),
    execute
  })
}

describe('withLessons', () => {
  beforeEach(() => {
    fakeStorage = createFakeStorage()
    getFailureStreakMock.mockReset()
    getFailureStreakMock.mockResolvedValue(0)
  })

  it('passes through the result unchanged when there are no stored lessons', async () => {
    const wrapped = withLessons('my_tool', makeTool(async () => ({ result: 'ok' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions)
    expect(result).toEqual({ result: 'ok' })
  })

  it('merges stored lessons into the result as a hints field', async () => {
    await fakeStorage.setItem('my_tool', ['past failure note'])
    const wrapped = withLessons('my_tool', makeTool(async () => ({ result: 'ok' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions) as { result: string, hints: string[] }
    expect(result.result).toBe('ok')
    expect(result.hints).toEqual(['past failure note'])
  })

  it('does not touch lessons stored under a different tool name', async () => {
    await fakeStorage.setItem('other_tool', ['unrelated'])
    const wrapped = withLessons('my_tool', makeTool(async () => ({ result: 'ok' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions)
    expect(result).toEqual({ result: 'ok' })
  })

  it('merges a degraded flag and hint when this call\'s own failure pushes the streak to the threshold', async () => {
    // Prior streak is 4 (one below threshold) — this call's own failure must
    // push it to 5 for the flag to appear on THIS call's result, not the next.
    getFailureStreakMock.mockResolvedValue(4)
    const wrapped = withLessons('my_tool', makeTool(async () => ({ error: 'boom' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions) as { error: string, degraded: boolean, degradedHint: string }
    expect(result.error).toBe('boom')
    expect(result.degraded).toBe(true)
    expect(result.degradedHint).toMatch(/failed 5\+ times in a row/)
  })

  it('does not add a degraded flag when this call\'s own failure only brings the streak below the threshold', async () => {
    getFailureStreakMock.mockResolvedValue(2)
    const wrapped = withLessons('my_tool', makeTool(async () => ({ error: 'boom' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions)
    expect(result).toEqual({ error: 'boom' })
  })

  it('does not report degraded on a call that itself succeeds, even with a high prior streak', async () => {
    // A success always resets the streak to 0 (mirrors lessons-sink.ts's own
    // reset-on-success) — a call that just succeeded must never claim
    // degraded: true about itself, regardless of how many prior calls failed.
    getFailureStreakMock.mockResolvedValue(10)
    const wrapped = withLessons('my_tool', makeTool(async () => ({ result: 'ok' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions)
    expect(result).toEqual({ result: 'ok' })
  })

  it('merges both hints and degraded fields together when both apply', async () => {
    await fakeStorage.setItem('my_tool', ['past failure note'])
    getFailureStreakMock.mockResolvedValue(4)
    const wrapped = withLessons('my_tool', makeTool(async () => ({ error: 'boom' })))
    const result = await wrapped.execute!({ x: 1 }, toolOptions) as { hints: string[], degraded: boolean }
    expect(result.hints).toEqual(['past failure note'])
    expect(result.degraded).toBe(true)
  })
})

describe('withConfirmation', () => {
  it('calls the real execute when requestConfirmation resolves true', async () => {
    const inner = vi.fn(async () => ({ result: 'done' }))
    const wrapped = withConfirmation('risky_tool', makeTool(inner))
    const requestConfirmation = vi.fn(async () => true)
    const result = await wrapped.execute!({ x: 1 }, { ...toolOptions, experimental_context: { model: 'm', requestConfirmation } })
    expect(requestConfirmation).toHaveBeenCalledWith('risky_tool', { x: 1 })
    expect(inner).toHaveBeenCalled()
    expect(result).toEqual({ result: 'done' })
  })

  it('short-circuits without calling execute when requestConfirmation resolves false', async () => {
    const inner = vi.fn(async () => ({ result: 'done' }))
    const wrapped = withConfirmation('risky_tool', makeTool(inner))
    const requestConfirmation = vi.fn(async () => false)
    const result = await wrapped.execute!({ x: 1 }, { ...toolOptions, experimental_context: { model: 'm', requestConfirmation } })
    expect(inner).not.toHaveBeenCalled()
    expect(result).toEqual({ error: 'Rejected by user' })
  })

  it('calls the real execute directly when there is no confirmation context (e.g. sub-agent calls)', async () => {
    const inner = vi.fn(async () => ({ result: 'done' }))
    const wrapped = withConfirmation('risky_tool', makeTool(inner))
    const result = await wrapped.execute!({ x: 1 }, toolOptions)
    expect(inner).toHaveBeenCalled()
    expect(result).toEqual({ result: 'done' })
  })
})
