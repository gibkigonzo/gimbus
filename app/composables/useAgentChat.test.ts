import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubGlobal('ref', <T>(v: T) => ({ value: v }))

vi.mock('./useModels', () => ({
  useModels: () => ({ model: { value: 'openai/gpt-4o-mini' } })
}))

vi.mock('#components', () => ({ LazyModalConfirm: {} }))

vi.stubGlobal('useTools', () => ({ selectedToolNames: { value: [] } }))

const fetchMock = vi.fn()
vi.stubGlobal('fetch', (...args: unknown[]) => fetchMock(...args))

const { useAgentChat } = await import('./useAgentChat')

function sseResponse(chunks: Record<string, unknown>[]) {
  const body = chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('')
  return new Response(body, { status: 200 })
}

describe('useAgentChat', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  it('sets status to error and captures the message when the stream emits an error chunk', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      { type: 'error', message: 'not enough credits' },
      { type: 'done' }
    ]))

    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    expect(chat.status.value).toBe('error')
    expect(chat.error.value?.message).toBe('not enough credits')
  })

  it('still applies text deltas received before the error chunk', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      { type: 'text-delta', text: 'partial reply' },
      { type: 'error', message: 'boom' },
      { type: 'done' }
    ]))

    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    expect(chat.messages.value.at(-1)).toMatchObject({ role: 'assistant', content: 'partial reply' })
    expect(chat.status.value).toBe('error')
    expect(chat.error.value?.message).toBe('boom')
  })

  it('ignores a malformed JSON line without affecting status', async () => {
    fetchMock.mockResolvedValue(sseResponse([{ type: 'done' }]))
    fetchMock.mockResolvedValueOnce(new Response('data: {not-json\n\ndata: {"type":"done"}\n\n', { status: 200 }))

    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    expect(chat.status.value).toBe('idle')
    expect(chat.error.value).toBeNull()
  })

  it('attaches usage to the tool-result message for a pure tool-calling step (no text-delta)', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      { type: 'tool-result', toolName: 'manage_tasks', result: { tasks: [] }, model: 'anthropic/claude-sonnet-4.6', toolCalledWith: '{}' },
      { type: 'usage', inputTokens: 100, outputTokens: 20, cachedTokens: 0, model: 'anthropic/claude-sonnet-4.6', truncated: false },
      { type: 'done' }
    ]))

    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    const toolMessage = chat.messages.value.at(-1)!
    expect(toolMessage.role).toBe('tool')
    expect(toolMessage.inputTokens).toBe(100)
    expect(toolMessage.outputTokens).toBe(20)
    expect(toolMessage.truncated).toBe(false)
  })

  it('marks a message truncated when its step was cut off by the output token limit', async () => {
    fetchMock.mockResolvedValue(sseResponse([
      { type: 'text-delta', text: 'partial' },
      { type: 'usage', inputTokens: 6586, outputTokens: 8192, cachedTokens: 6258, model: 'anthropic/claude-sonnet-4.6', truncated: true },
      { type: 'done' }
    ]))

    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    expect(chat.messages.value.at(-1)).toMatchObject({ role: 'assistant', content: 'partial', truncated: true })
  })

  it('stop() marks the last non-user message sealed:false, so needsReply can react without waiting for a reload', async () => {
    fetchMock.mockResolvedValue(sseResponse([{ type: 'text-delta', text: 'partial reply' }, { type: 'done' }]))
    const chat = useAgentChat({ chatId: 'chat-1' })
    await chat.sendMessage('hello')

    chat.stop()

    expect(chat.messages.value.at(-1)).toMatchObject({ role: 'assistant', sealed: false })
  })

  it('stop() does not touch a trailing user message (nothing streamed back yet)', async () => {
    const chat = useAgentChat({ chatId: 'chat-1' })
    chat.messages.value.push({ id: '1', role: 'user', content: 'hello', parts: [{ type: 'text', text: 'hello' }] })

    chat.stop()

    expect(chat.messages.value.at(-1)).not.toHaveProperty('sealed')
  })
})
