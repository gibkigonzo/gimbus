import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolExecutionOptions } from 'ai'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', (...args: unknown[]) => fetchMock(...args))

const { hubShellExecTool, hubSubmitAnswerTool } = await import('./hub-shell')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function execShell(cmd: string) {
  return hubShellExecTool.execute!({ cmd }, toolOptions)
}

function submitAnswer(task: string, answer: Record<string, unknown>) {
  return hubSubmitAnswerTool.execute!({ task, answer }, toolOptions)
}

describe('hub_shell_exec', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    process.env.USER_ID = 'test-key'
  })

  it.each(['cat /etc/passwd', 'ls /root', 'cat /proc/1/status', 'ls -la \'/etc/\''])(
    'blocks a forbidden path command without calling the API: %s',
    async (cmd) => {
      const result = await execShell(cmd) as { error?: string }
      expect(result.error).toMatch(/Blocked/)
      expect(fetchMock).not.toHaveBeenCalled()
    }
  )

  it('does not block commands that merely mention similar-looking but distinct paths', async () => {
    fetchMock.mockResolvedValue({ code: 0, message: 'ok' })
    const result = await execShell('ls /opt/firmware/cooler') as { result?: unknown }
    expect(result.result).toEqual({ code: 0, message: 'ok' })
  })

  it('sends the apikey and cmd to the shell endpoint', async () => {
    fetchMock.mockResolvedValue({ code: 0, message: 'ok' })
    await execShell('help')
    expect(fetchMock).toHaveBeenCalledWith('https://hub.ag3nts.org/api/shell', {
      method: 'POST',
      body: { apikey: 'test-key', cmd: 'help' }
    })
  })

  it('shapes a thrown fetch error into a descriptive result instead of throwing', async () => {
    fetchMock.mockRejectedValue({
      statusCode: 429,
      statusMessage: 'Too Many Requests',
      data: { code: -1, message: 'rate limited' },
      response: { headers: new Headers({ 'retry-after': '30' }) }
    })
    const result = await execShell('help') as { error: string, statusCode: number, retryAfterSeconds: number }
    expect(result.error).toBe('Too Many Requests')
    expect(result.statusCode).toBe(429)
    expect(result.retryAfterSeconds).toBe(30)
  })

  it('serializes concurrent calls so the second does not start until the first resolves', async () => {
    const order: string[] = []
    let resolveFirst!: () => void
    fetchMock.mockImplementationOnce(() => {
      order.push('first-start')
      return new Promise((resolve) => {
        resolveFirst = () => {
          order.push('first-end')
          resolve({ code: 0 })
        }
      })
    })
    fetchMock.mockImplementationOnce(async () => {
      order.push('second-start')
      return { code: 0 }
    })

    const first = execShell('cmd-1')
    const second = execShell('cmd-2')

    await new Promise(r => setTimeout(r, 10))
    expect(order).toEqual(['first-start'])

    resolveFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first-start', 'first-end', 'second-start'])
  })
})

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
