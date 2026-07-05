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
