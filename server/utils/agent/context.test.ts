import { describe, it, expect, vi } from 'vitest'
import type { ToolModelMessage, UserModelMessage } from 'ai'

const blobGetMock = vi.fn()
vi.mock('hub:blob', () => ({
  blob: { get: (...args: unknown[]) => blobGetMock(...args) }
}))

const { buildContext } = await import('./context')

type DbMessageFixture = Parameters<typeof buildContext>[0][number]

function dbMessage(overrides: Partial<DbMessageFixture>): DbMessageFixture {
  return {
    id: 'm1',
    chatId: 'chat1',
    role: 'user',
    content: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    cachedTokens: null,
    toolCalls: null,
    toolCallId: null,
    toolCalledWith: null,
    attachments: null,
    sealed: false,
    agentSource: null,
    createdAt: new Date(),
    ...overrides
  } as DbMessageFixture
}

describe('buildContext', () => {
  it('extracts the system message onto context.system with openrouter cacheControl providerOptions', async () => {
    const { system, messages } = await buildContext([
      dbMessage({ role: 'system', content: 'You are an agent.' })
    ])
    expect(system).toEqual({
      role: 'system',
      content: 'You are an agent.',
      providerOptions: { openrouter: { cacheControl: { type: 'ephemeral' } } }
    })
    expect(messages).toEqual([])
  })

  it('recovers the toolName for a tool-result row from the preceding assistant tool_calls', async () => {
    const { messages } = await buildContext([
      dbMessage({
        role: 'assistant',
        content: null,
        toolCalls: JSON.stringify([{ id: 'call_1', type: 'function', function: { name: 'manage_tasks', arguments: '{}' } }])
      }),
      dbMessage({ role: 'tool', content: '{"tasks":[]}', toolCallId: 'call_1' })
    ])

    expect(messages[1]).toEqual({
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call_1',
        toolName: 'manage_tasks',
        output: { type: 'json', value: { tasks: [] } }
      }]
    })
  })

  it('falls back to "unknown" toolName when no matching assistant tool_call is found', async () => {
    const { messages } = await buildContext([
      dbMessage({ role: 'tool', content: '{}', toolCallId: 'orphan_call' })
    ])
    const toolMessage = messages[0] as ToolModelMessage
    expect(toolMessage.content[0]).toMatchObject({ toolName: 'unknown' })
  })

  it('converts an assistant message with tool_calls into text + tool-call content parts', async () => {
    const { messages } = await buildContext([
      dbMessage({
        role: 'assistant',
        content: 'Let me check.',
        toolCalls: JSON.stringify([{ id: 'call_1', type: 'function', function: { name: 'manage_tasks', arguments: '{"operation":"list"}' } }])
      })
    ])
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool-call', toolCallId: 'call_1', toolName: 'manage_tasks', input: { operation: 'list' } }
      ]
    })
  })

  it('keeps a plain-text assistant message as a bare string', async () => {
    const { messages } = await buildContext([
      dbMessage({ role: 'assistant', content: 'Hello there.' })
    ])
    expect(messages[0]).toEqual({ role: 'assistant', content: 'Hello there.' })
  })

  it('marks an @mention sub-agent reply as delegated rather than the main agent\'s own words', async () => {
    const { messages } = await buildContext([
      dbMessage({ role: 'assistant', content: 'Here is what I found.', agentSource: 'researcher' })
    ])
    expect(messages[0]).toEqual({
      role: 'assistant',
      content: '[Delegated reply from sub-agent "researcher" — it did not see this conversation; this is a specialist\'s answer, not something you said]\nHere is what I found.'
    })
  })

  it('does not annotate an ordinary assistant message with no agentSource', async () => {
    const { messages } = await buildContext([
      dbMessage({ role: 'assistant', content: 'Hello there.', agentSource: null })
    ])
    expect(messages[0]).toEqual({ role: 'assistant', content: 'Hello there.' })
  })

  it('inlines image attachments as base64 data URLs alongside text', async () => {
    blobGetMock.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('fake-image-bytes').buffer
    })

    const { messages } = await buildContext([
      dbMessage({
        role: 'user',
        content: 'What is in this image?',
        attachments: JSON.stringify([{ type: 'file', mediaType: 'image/png', pathname: 'uploads/a.png' }])
      })
    ])

    const message = messages[0] as UserModelMessage
    const content = message.content
    expect(message.role).toBe('user')
    expect(Array.isArray(content)).toBe(true)
    if (!Array.isArray(content)) throw new Error('expected array content')
    expect(content[0]).toMatchObject({ type: 'image' })
    expect((content[0] as { image: string }).image).toMatch(/^data:image\/png;base64,/)
    expect(content[1]).toEqual({ type: 'text', text: 'What is in this image?' })
  })

  it('skips attachments whose blob cannot be found', async () => {
    blobGetMock.mockResolvedValue(null)

    const { messages } = await buildContext([
      dbMessage({
        role: 'user',
        content: 'Missing image',
        attachments: JSON.stringify([{ type: 'file', mediaType: 'image/png', pathname: 'uploads/missing.png' }])
      })
    ])

    expect(messages[0]).toEqual({ role: 'user', content: 'Missing image' })
  })

  it('appends a new user message for the current turn', async () => {
    const { messages } = await buildContext([], { content: 'New message' })
    expect(messages).toEqual([{ role: 'user', content: 'New message' }])
  })
})
