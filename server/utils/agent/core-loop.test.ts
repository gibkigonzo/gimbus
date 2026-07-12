import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SseChunk } from '#shared/types/agent-runtime'
import type { TextStreamPart, ToolSet, LanguageModelUsage, ModelMessage } from 'ai'

type FakePart = Partial<TextStreamPart<ToolSet>> & { type: string }

function fakeUsage(inputTokens: number, outputTokens: number, cacheReadTokens: number): LanguageModelUsage {
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    inputTokenDetails: { cacheReadTokens, noCacheTokens: inputTokens - cacheReadTokens, cacheWriteTokens: 0 },
    outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 }
  }
}

const streamTextMock = vi.fn()
const stepCountIsMock = vi.fn((n: number) => ({ __stepCount: n }))

vi.mock('ai', () => ({
  streamText: (...args: unknown[]) => streamTextMock(...args),
  stepCountIs: (...args: [number]) => stepCountIsMock(...args)
}))

vi.mock('./model-provider', () => ({
  getModel: (modelId: string) => ({ modelId })
}))

const { runAgentLoopCore, mapStreamPartToSse, markLastMessageCacheable, MAX_OUTPUT_TOKENS } = await import('./core-loop')

async function* toAsyncIterable<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

function fakeStreamTextResult(parts: FakePart[], steps: object[]) {
  return {
    fullStream: toAsyncIterable(parts),
    steps: Promise.resolve(steps)
  }
}

function map(part: FakePart, model: string): SseChunk | null {
  return mapStreamPartToSse(part as TextStreamPart<ToolSet>, model)
}

describe('mapStreamPartToSse', () => {
  const model = 'openai/gpt-4o-mini'

  it('maps text-delta', () => {
    expect(map({ type: 'text-delta', text: 'hi' }, model))
      .toEqual({ type: 'text-delta', text: 'hi' })
  })

  it('maps tool-result', () => {
    const chunk = map({ type: 'tool-result', toolName: 'manage_tasks', input: { a: 1 }, output: { ok: true } }, model)
    expect(chunk).toEqual({ type: 'tool-result', toolName: 'manage_tasks', result: { ok: true }, model, toolCalledWith: JSON.stringify({ a: 1 }) })
  })

  it('maps tool-error defensively to a tool-result shape with {error}', () => {
    const chunk = map({ type: 'tool-error', toolName: 'analyze_image', input: {}, error: new Error('boom') }, model)
    expect(chunk).toEqual({ type: 'tool-result', toolName: 'analyze_image', result: { error: 'boom' }, model, toolCalledWith: '{}' })
  })

  it('maps finish-step to usage', () => {
    const chunk = map({
      type: 'finish-step',
      usage: fakeUsage(10, 5, 3),
      finishReason: 'tool-calls'
    }, model)
    expect(chunk).toEqual({ type: 'usage', inputTokens: 10, outputTokens: 5, cachedTokens: 3, model, truncated: false })
  })

  it('flags a step cut off by the output token limit as truncated', () => {
    const chunk = map({
      type: 'finish-step',
      usage: fakeUsage(6586, 8192, 6258),
      finishReason: 'length'
    }, model)
    expect(chunk).toEqual({ type: 'usage', inputTokens: 6586, outputTokens: 8192, cachedTokens: 6258, model, truncated: true })
  })

  it('maps error', () => {
    const chunk = map({ type: 'error', error: new Error('stream failed') }, model)
    expect(chunk).toEqual({ type: 'error', message: 'stream failed' })
  })

  it('returns null for an abort part (no SSE emission)', () => {
    expect(map({ type: 'abort' }, model)).toBeNull()
  })

  it('returns null for irrelevant parts (tool-call, start-step, finish, raw)', () => {
    for (const type of ['tool-call', 'start-step', 'finish', 'raw', 'start'] as const) {
      expect(map({ type }, model)).toBeNull()
    }
  })
})

describe('markLastMessageCacheable', () => {
  it('returns an empty array unchanged', () => {
    expect(markLastMessageCacheable([])).toEqual([])
  })

  it('marks only the last message, leaving earlier ones untouched', () => {
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'second' }
    ]
    const result = markLastMessageCacheable(messages)
    expect(result[0]).toEqual({ role: 'user', content: 'first' })
    expect(result[1]).toEqual({
      role: 'assistant',
      content: 'second',
      providerOptions: { openrouter: { cacheControl: { type: 'ephemeral' } } }
    })
  })

  it('preserves and extends existing providerOptions on the last message', () => {
    const messages = [
      { role: 'user' as const, content: 'hi', providerOptions: { anthropic: { foo: 'bar' } } }
    ]
    const result = markLastMessageCacheable(messages)
    expect(result[0]).toEqual({
      role: 'user',
      content: 'hi',
      providerOptions: {
        anthropic: { foo: 'bar' },
        openrouter: { cacheControl: { type: 'ephemeral' } }
      }
    })
  })

  it('does not mutate the input array', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }]
    const result = markLastMessageCacheable(messages)
    expect(result).not.toBe(messages)
    expect(messages[0]).toEqual({ role: 'user', content: 'hi' })
  })

  it('moves the breakpoint instead of accumulating one per step, across many simulated steps', () => {
    // Mirrors what prepareStep actually does: each "step" appends a new message
    // to the array streamText already carries forward (including whatever
    // markLastMessageCacheable left on it from the previous step), then calls
    // markLastMessageCacheable again on the whole thing.
    let messages: ModelMessage[] = [{ role: 'user', content: 'first' }]
    for (let step = 0; step < 6; step++) {
      messages = markLastMessageCacheable(messages)
      messages = [...messages, { role: 'assistant', content: `step ${step}` }]
    }
    messages = markLastMessageCacheable(messages)

    const withMarker = messages.filter(
      m => (m.providerOptions as { openrouter?: { cacheControl?: unknown } } | undefined)?.openrouter?.cacheControl
    )
    expect(withMarker).toHaveLength(1)
    expect(withMarker[0]).toBe(messages[messages.length - 1])
  })
})

describe('runAgentLoopCore', () => {
  beforeEach(() => {
    streamTextMock.mockReset()
    stepCountIsMock.mockClear()
  })

  it('passes stepCountIs(60) as stopWhen', async () => {
    streamTextMock.mockReturnValue(fakeStreamTextResult([], []))
    await runAgentLoopCore(() => {}, { messages: [] }, {}, [], 'openai/gpt-4o-mini')
    expect(stepCountIsMock).toHaveBeenCalledWith(60)
    expect(streamTextMock.mock.calls[0]![0]).toMatchObject({ stopWhen: { __stepCount: 60 } })
  })

  it('caps maxOutputTokens so a model default ceiling is never requested outright', async () => {
    streamTextMock.mockReturnValue(fakeStreamTextResult([], []))
    await runAgentLoopCore(() => {}, { messages: [] }, {}, [], 'openai/gpt-4o-mini')
    expect(streamTextMock.mock.calls[0]![0]).toMatchObject({ maxOutputTokens: MAX_OUTPUT_TOKENS })
  })

  it('passes a prepareStep that moves the cache breakpoint to the last message of the step', async () => {
    streamTextMock.mockReturnValue(fakeStreamTextResult([], []))
    await runAgentLoopCore(() => {}, { messages: [] }, {}, [], 'openai/gpt-4o-mini')
    const { prepareStep } = streamTextMock.mock.calls[0]![0]
    const stepMessages = [{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]
    const result = await prepareStep({ messages: stepMessages })
    expect(result.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'b',
      providerOptions: { openrouter: { cacheControl: { type: 'ephemeral' } } }
    })
  })

  it('logs the specific message when the stream emits an error part', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    streamTextMock.mockReturnValue(fakeStreamTextResult([{ type: 'error', error: new Error('not enough credits') }], []))
    await runAgentLoopCore(vi.fn(), { messages: [] }, {}, [], 'openai/gpt-4o-mini')
    expect(consoleErrorSpy).toHaveBeenCalledWith('[agent] Stream error', 'not enough credits')
    consoleErrorSpy.mockRestore()
  })

  it('builds alternating assistant/tool LoopMessages across multiple steps, with one usage entry per step', async () => {
    const steps = [
      {
        text: '',
        toolCalls: [{ toolCallId: 'call_1', toolName: 'manage_tasks', input: { operation: 'list' } }],
        toolResults: [{ toolCallId: 'call_1', input: { operation: 'list' }, output: { tasks: [] } }],
        usage: fakeUsage(100, 20, 10)
      },
      {
        text: 'All done.',
        toolCalls: [],
        toolResults: [],
        usage: fakeUsage(50, 5, 0)
      }
    ]
    streamTextMock.mockReturnValue(fakeStreamTextResult([], steps))

    const pushSse = vi.fn()
    const result = await runAgentLoopCore(pushSse, { messages: [] }, {}, [], 'openai/gpt-4o-mini')

    expect(result.messages).toEqual([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'manage_tasks', arguments: '{"operation":"list"}' } }] },
      { role: 'tool', content: '{"tasks":[]}', tool_call_id: 'call_1', toolCalledWith: '{"operation":"list"}' },
      { role: 'assistant', content: 'All done.', tool_calls: undefined }
    ])
    expect(result.usagePerTurn).toEqual([
      { inputTokens: 100, outputTokens: 20, cachedTokens: 10 },
      { inputTokens: 50, outputTokens: 5, cachedTokens: 0 }
    ])
  })

  it('produces no error SSE chunk when the stream is aborted mid-loop', async () => {
    streamTextMock.mockReturnValue(fakeStreamTextResult([{ type: 'abort' }], []))
    const pushSse = vi.fn<(chunk: SseChunk) => void>()
    await runAgentLoopCore(pushSse, { messages: [] }, {}, [], 'openai/gpt-4o-mini')

    const chunkTypes = pushSse.mock.calls.map(([c]) => c.type)
    expect(chunkTypes).not.toContain('error')
    expect(chunkTypes).toContain('done')
  })

  it('reports aborted: false when no signal is passed', async () => {
    streamTextMock.mockReturnValue(fakeStreamTextResult([], []))
    const result = await runAgentLoopCore(() => {}, { messages: [] }, {}, [], 'openai/gpt-4o-mini')
    expect(result.aborted).toBe(false)
  })

  it('reports aborted: true when the passed signal was aborted, alongside whatever steps already completed', async () => {
    const steps = [{ text: 'partial', toolCalls: [], toolResults: [], usage: fakeUsage(10, 2, 0) }]
    streamTextMock.mockReturnValue(fakeStreamTextResult([{ type: 'abort' }], steps))
    const controller = new AbortController()
    controller.abort()

    const result = await runAgentLoopCore(() => {}, { messages: [] }, {}, [], 'openai/gpt-4o-mini', controller.signal)

    expect(result.aborted).toBe(true)
    // Whatever fully-completed steps happened before the abort are still
    // returned, not discarded — this is what makes "save partial progress"
    // possible upstream in saveTurn().
    expect(result.messages).toEqual([{ role: 'assistant', content: 'partial', tool_calls: undefined }])
  })

  it('always ends with a done chunk, even when streamText throws before any part is emitted', async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error('network down')
    })
    const pushSse = vi.fn<(chunk: SseChunk) => void>()
    const result = await runAgentLoopCore(pushSse, { messages: [] }, {}, [], 'openai/gpt-4o-mini')

    const chunks = pushSse.mock.calls.map(([c]) => c)
    expect(chunks.at(-1)).toEqual({ type: 'done' })
    expect(chunks.some(c => c.type === 'error' && c.message === 'network down')).toBe(true)
    expect(result.messages).toEqual([])
  })
})
