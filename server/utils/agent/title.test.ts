import { describe, it, expect, vi, beforeEach } from 'vitest'

const structuredChatMock = vi.fn()
vi.mock('../openrouter', () => ({
  structuredChat: (...args: unknown[]) => structuredChatMock(...args)
}))

const updateChatTitleMock = vi.fn()
vi.mock('../db/queries', () => ({
  updateChatTitle: (...args: unknown[]) => updateChatTitleMock(...args)
}))

const { maybeGenerateChatTitle } = await import('./title')

function loopResult(assistantText: string): AgentLoopResult {
  return {
    messages: [{ role: 'assistant', content: assistantText }],
    usagePerTurn: [null]
  }
}

describe('maybeGenerateChatTitle', () => {
  const pushSse = vi.fn()

  beforeEach(() => {
    structuredChatMock.mockReset()
    updateChatTitleMock.mockReset()
    pushSse.mockReset()
  })

  it('does nothing on turns after the first', async () => {
    await maybeGenerateChatTitle('chat-1', 'model-a', false, '<message>\nhi\n</message>', loopResult('hello'), pushSse)
    expect(structuredChatMock).not.toHaveBeenCalled()
    expect(updateChatTitleMock).not.toHaveBeenCalled()
  })

  it('does nothing when there is no user content (e.g. a triggered turn)', async () => {
    await maybeGenerateChatTitle('chat-1', 'model-a', true, undefined, loopResult('hello'), pushSse)
    expect(structuredChatMock).not.toHaveBeenCalled()
  })

  it('generates and persists a title on the first turn, and pushes a title chunk', async () => {
    structuredChatMock.mockResolvedValue({ title: 'Debugging a flaky test' })

    await maybeGenerateChatTitle('chat-1', 'model-a', true, '<message>\nwhy is my test flaky?\n</message>', loopResult('Because...'), pushSse)

    expect(structuredChatMock).toHaveBeenCalledTimes(1)
    const [messages, , model] = structuredChatMock.mock.calls[0] as [{ content: string }[], unknown, string]
    expect(messages[0]!.content).toContain('why is my test flaky?')
    expect(messages[0]!.content).toContain('Because...')
    expect(model).toBe('model-a')

    expect(updateChatTitleMock).toHaveBeenCalledWith('chat-1', 'Debugging a flaky test')
    expect(pushSse).toHaveBeenCalledWith({ type: 'title', title: 'Debugging a flaky test' })
  })

  it('swallows errors instead of throwing, so a failed title never breaks the turn', async () => {
    structuredChatMock.mockRejectedValue(new Error('rate limited'))

    await expect(
      maybeGenerateChatTitle('chat-1', 'model-a', true, '<message>\nhi\n</message>', loopResult('hi there'), pushSse)
    ).resolves.toBeUndefined()

    expect(updateChatTitleMock).not.toHaveBeenCalled()
    expect(pushSse).not.toHaveBeenCalled()
  })
})
