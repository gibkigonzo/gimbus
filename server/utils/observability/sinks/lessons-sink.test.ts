import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolCallEvent } from '../types'

function createFakeStorage() {
  const store = new Map<string, unknown>()
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { store.set(key, value) }
  }
}

// Real unstorage namespaces state by the prefix passed to useStorage(prefix) —
// this fake must too, since lessons-sink.ts now uses two separate prefixes
// ('lessons' notes, 'lessons-streak' failure counts) that must not collide.
let storagesByPrefix = new Map<string, ReturnType<typeof createFakeStorage>>()
function getFakeStorage(prefix: string) {
  let storage = storagesByPrefix.get(prefix)
  if (!storage) {
    storage = createFakeStorage()
    storagesByPrefix.set(prefix, storage)
  }
  return storage
}
vi.stubGlobal('useStorage', (prefix: string) => getFakeStorage(prefix))

const { createLessonsSink, isToolDegraded, DEGRADED_FAILURE_THRESHOLD } = await import('./lessons-sink')

function event(overrides: Partial<ToolCallEvent>): ToolCallEvent {
  return {
    meta: {},
    toolName: 'some_tool',
    input: { foo: 'bar' },
    durationMs: 1,
    ...overrides
  }
}

describe('lessons-sink', () => {
  let sink: ReturnType<typeof createLessonsSink>

  beforeEach(() => {
    storagesByPrefix = new Map()
    sink = createLessonsSink()
  })

  it('ignores successful tool calls', async () => {
    await sink.onToolCall?.(event({ output: { result: 'ok' } }))
    expect(await getFakeStorage('lessons').getItem('some_tool')).toBeNull()
  })

  it('records a lesson when the tool output has an error field', async () => {
    await sink.onToolCall?.(event({ output: { error: 'path not found' } }))
    const lessons = await getFakeStorage('lessons').getItem('some_tool') as string[]
    expect(lessons).toHaveLength(1)
    expect(lessons[0]).toMatch(/path not found/)
  })

  it('records a lesson when ai-sdk reports a thrown error', async () => {
    await sink.onToolCall?.(event({ error: new Error('boom') }))
    const lessons = await getFakeStorage('lessons').getItem('some_tool') as string[]
    expect(lessons[0]).toMatch(/boom/)
  })

  it('deduplicates identical notes', async () => {
    await sink.onToolCall?.(event({ output: { error: 'same error' } }))
    await sink.onToolCall?.(event({ output: { error: 'same error' } }))
    const lessons = await getFakeStorage('lessons').getItem('some_tool') as string[]
    expect(lessons).toHaveLength(1)
  })

  it('caps the number of stored lessons per tool', async () => {
    for (let i = 0; i < 10; i++) {
      await sink.onToolCall?.(event({ output: { error: `error ${i}` } }))
    }
    const lessons = await getFakeStorage('lessons').getItem('some_tool') as string[]
    expect(lessons).toHaveLength(5)
    expect(lessons[lessons.length - 1]).toMatch(/error 9/)
  })

  describe('failure streak / isToolDegraded', () => {
    it('is not degraded with no calls recorded', async () => {
      expect(await isToolDegraded('some_tool')).toBe(false)
    })

    it('is not degraded below the failure threshold', async () => {
      for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD - 1; i++) {
        await sink.onToolCall?.(event({ output: { error: `error ${i}` } }))
      }
      expect(await isToolDegraded('some_tool')).toBe(false)
    })

    it('becomes degraded once the streak reaches the threshold', async () => {
      for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD; i++) {
        await sink.onToolCall?.(event({ output: { error: `error ${i}` } }))
      }
      expect(await isToolDegraded('some_tool')).toBe(true)
    })

    it('resets the streak to 0 on any success', async () => {
      for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD; i++) {
        await sink.onToolCall?.(event({ output: { error: `error ${i}` } }))
      }
      expect(await isToolDegraded('some_tool')).toBe(true)

      await sink.onToolCall?.(event({ output: { result: 'ok' } }))
      expect(await isToolDegraded('some_tool')).toBe(false)
    })

    it('keeps different tools\' streaks independent', async () => {
      for (let i = 0; i < DEGRADED_FAILURE_THRESHOLD; i++) {
        await sink.onToolCall?.(event({ toolName: 'tool_a', output: { error: `error ${i}` } }))
      }
      expect(await isToolDegraded('tool_a')).toBe(true)
      expect(await isToolDegraded('tool_b')).toBe(false)
    })
  })
})
