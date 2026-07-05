import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolExecutionOptions } from 'ai'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', (...args: unknown[]) => fetchMock(...args))

const { hubSubmitAnswerTool } = await import('./hub-shell')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function submitAnswer(task: string, answer: Record<string, unknown>) {
  return hubSubmitAnswerTool.execute!({ task, answer }, toolOptions)
}

describe('hub_submit_answer', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    process.env.USER_ID = 'test-key'
  })

  it('posts the task and answer to /verify', async () => {
    fetchMock.mockResolvedValue({ code: 0, message: 'ok' })
    const result = await submitAnswer('firmware', { confirmation: 'ECCS-abc' }) as { result?: unknown }
    expect(fetchMock).toHaveBeenCalledWith('https://hub.ag3nts.org/verify', {
      method: 'POST',
      body: { apikey: 'test-key', task: 'firmware', answer: { confirmation: 'ECCS-abc' } }
    })
    expect(result.result).toEqual({ code: 0, message: 'ok' })
  })

  it('shapes errors instead of throwing', async () => {
    fetchMock.mockRejectedValue({ statusCode: 400, statusMessage: 'Bad Request' })
    const result = await submitAnswer('firmware', { confirmation: 'wrong' }) as { error: string, statusCode: number }
    expect(result.error).toBe('Bad Request')
    expect(result.statusCode).toBe(400)
  })
})
