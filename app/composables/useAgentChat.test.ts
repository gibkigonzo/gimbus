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
})
