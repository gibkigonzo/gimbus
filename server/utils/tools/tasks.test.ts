import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolExecutionOptions } from 'ai'

function createFakeStorage() {
  const store = new Map<string, unknown>()
  return {
    getItem: async (key: string) => store.get(key) ?? null,
    setItem: async (key: string, value: unknown) => { store.set(key, value) }
  }
}

// useStorage(mountPoint) returns the SAME persistent driver across calls in real Nitro —
// mirror that by handing out one singleton per test instead of a fresh Map per call.
let fakeStorage = createFakeStorage()
vi.stubGlobal('useStorage', () => fakeStorage)

const { manageTasksTool } = await import('./tasks')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

type RunArgs = Parameters<NonNullable<typeof manageTasksTool.execute>>[0]

function run(args: RunArgs) {
  return manageTasksTool.execute!(args, toolOptions)
}

interface TaskListResult {
  tasks?: { id: number, description: string, status: 'pending' | 'done', result?: string }[]
  error?: string
}

describe('manage_tasks tool', () => {
  const sessionId = 'session-1'

  beforeEach(() => {
    fakeStorage = createFakeStorage()
  })

  it('lists an empty task list initially', async () => {
    const result = await run({ session_id: sessionId, operation: 'list' }) as TaskListResult
    expect(result.tasks).toEqual([])
  })

  it('adds a task', async () => {
    await run({ session_id: sessionId, operation: 'add', task: 'Find the flag' })
    const result = await run({ session_id: sessionId, operation: 'list' }) as TaskListResult
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks![0]).toMatchObject({ id: 1, description: 'Find the flag', status: 'pending' })
  })

  it('refuses to add a second task while one is pending', async () => {
    await run({ session_id: sessionId, operation: 'add', task: 'First task' })
    const result = await run({ session_id: sessionId, operation: 'add', task: 'Second task' }) as TaskListResult
    expect(result.error).toMatch(/Complete the current pending task/)
  })

  it('completes a task with a result summary', async () => {
    await run({ session_id: sessionId, operation: 'add', task: 'Find the flag' })
    const result = await run({ session_id: sessionId, operation: 'complete', task_id: 1, result: 'Found it in /flag.txt' }) as TaskListResult
    expect(result.tasks![0]).toMatchObject({ id: 1, status: 'done', result: 'Found it in /flag.txt' })
  })

  it('errors when completing a nonexistent task', async () => {
    const result = await run({ session_id: sessionId, operation: 'complete', task_id: 999 }) as TaskListResult
    expect(result.error).toMatch(/not found/)
  })

  it('removes a task', async () => {
    await run({ session_id: sessionId, operation: 'add', task: 'Find the flag' })
    const result = await run({ session_id: sessionId, operation: 'remove', task_id: 1 }) as TaskListResult
    expect(result.tasks).toEqual([])
  })

  it('allows adding a new task after the pending one is completed', async () => {
    await run({ session_id: sessionId, operation: 'add', task: 'First task' })
    await run({ session_id: sessionId, operation: 'complete', task_id: 1, result: 'done' })
    const result = await run({ session_id: sessionId, operation: 'add', task: 'Second task' }) as TaskListResult
    expect(result.tasks).toHaveLength(2)
    expect(result.tasks![1]).toMatchObject({ id: 2, description: 'Second task', status: 'pending' })
  })
})
