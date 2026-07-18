import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ScheduledTaskDefinition } from './scheduled-task-definitions'

const structuredChatMock = vi.fn()
vi.mock('../openrouter', () => ({
  structuredChat: (...args: unknown[]) => structuredChatMock(...args)
}))

// Fake, durable-across-calls counter store standing in for the real DB-backed
// getScheduledTaskUnopenedCount/setScheduledTaskUnopenedCount — this must NOT
// be a useStorage mock: the whole point of the fix under test is that the
// counter survives a process restart, which useStorage (in-memory only in
// this project) can't do.
let counters = new Map<string, number>()
vi.mock('../db/queries', () => ({
  getScheduledTaskUnopenedCount: async (key: string) => counters.get(key) ?? 0,
  setScheduledTaskUnopenedCount: async (key: string, value: number) => { counters.set(key, value) }
}))

const { trackAndMaybeReviewValue } = await import('./scheduled-task-review')

const definition: ScheduledTaskDefinition = {
  key: 'test-task',
  chatTitle: 'Test chat',
  systemPrompt: 'system',
  workflowPrompt: 'workflow'
}

describe('trackAndMaybeReviewValue', () => {
  beforeEach(() => {
    counters = new Map()
    structuredChatMock.mockReset()
  })

  it('resets the counter and returns null when opened since last run', async () => {
    const result = await trackAndMaybeReviewValue(definition, true, ['summary'], 'model-a', 'chat-1')
    expect(result).toBeNull()
    expect(structuredChatMock).not.toHaveBeenCalled()
  })

  it('increments the counter and returns null below the threshold', async () => {
    const first = await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    const second = await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(structuredChatMock).not.toHaveBeenCalled()
  })

  it('calls structuredChat exactly on the threshold-th consecutive unopened run', async () => {
    structuredChatMock.mockResolvedValue({ stillValuable: true, reason: 'still useful' })

    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    const third = await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')

    expect(structuredChatMock).toHaveBeenCalledTimes(1)
    expect(third).toBeNull()

    const [, , model] = structuredChatMock.mock.calls[0] as [unknown, unknown, string]
    expect(model).toBe('model-a')
  })

  it('does not call structuredChat when there are no recent summaries', async () => {
    await trackAndMaybeReviewValue(definition, false, [], 'model-a', 'chat-1')
    await trackAndMaybeReviewValue(definition, false, [], 'model-a', 'chat-1')
    const third = await trackAndMaybeReviewValue(definition, false, [], 'model-a', 'chat-1')

    expect(third).toBeNull()
    expect(structuredChatMock).not.toHaveBeenCalled()
  })

  it('returns a flag note when the judge concludes the task is no longer valuable', async () => {
    structuredChatMock.mockResolvedValue({ stillValuable: false, reason: 'nobody reads it anymore' })

    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    const third = await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')

    expect(third).toContain('nobody reads it anymore')
    expect(third).toContain('3 consecutive runs')
  })

  it('returns null and does not throw when structuredChat rejects', async () => {
    structuredChatMock.mockRejectedValue(new Error('provider outage'))

    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')
    const third = await trackAndMaybeReviewValue(definition, false, ['summary'], 'model-a', 'chat-1')

    expect(third).toBeNull()
  })
})
