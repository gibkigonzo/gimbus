import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolCallEvent } from '../types'

function createFakeStorage() {
  const store = new Map<string, unknown>()
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { store.set(key, value) }
  }
}

let fakeStorage = createFakeStorage()
vi.stubGlobal('useStorage', () => fakeStorage)

const { createLessonsSink } = await import('./lessons-sink')

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
    fakeStorage = createFakeStorage()
    sink = createLessonsSink()
  })

  it('ignores successful tool calls', async () => {
    await sink.onToolCall?.(event({ output: { result: 'ok' } }))
    expect(await fakeStorage.getItem('some_tool')).toBeNull()
  })

  it('records a lesson when the tool output has an error field', async () => {
    await sink.onToolCall?.(event({ output: { error: 'path not found' } }))
    const lessons = await fakeStorage.getItem('some_tool') as string[]
    expect(lessons).toHaveLength(1)
    expect(lessons[0]).toMatch(/path not found/)
  })

  it('records a lesson when ai-sdk reports a thrown error', async () => {
    await sink.onToolCall?.(event({ error: new Error('boom') }))
    const lessons = await fakeStorage.getItem('some_tool') as string[]
    expect(lessons[0]).toMatch(/boom/)
  })

  it('deduplicates identical notes', async () => {
    await sink.onToolCall?.(event({ output: { error: 'same error' } }))
    await sink.onToolCall?.(event({ output: { error: 'same error' } }))
    const lessons = await fakeStorage.getItem('some_tool') as string[]
    expect(lessons).toHaveLength(1)
  })

  it('caps the number of stored lessons per tool', async () => {
    for (let i = 0; i < 10; i++) {
      await sink.onToolCall?.(event({ output: { error: `error ${i}` } }))
    }
    const lessons = await fakeStorage.getItem('some_tool') as string[]
    expect(lessons).toHaveLength(5)
    expect(lessons[lessons.length - 1]).toMatch(/error 9/)
  })
})
