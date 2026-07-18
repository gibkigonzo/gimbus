import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolExecutionOptions } from 'ai'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', (...args: unknown[]) => fetchMock(...args))

const { httpRequestTool } = await import('./http-request')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function request(args: { url: string, body?: Record<string, unknown>, headers?: Record<string, string> }) {
  return httpRequestTool.execute!(args, toolOptions)
}

describe('http_request', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    process.env.USER_ID = 'test-key'
  })

  it('rejects a non-allowlisted host without calling fetch', async () => {
    const result = await request({ url: 'https://evil.example.com/steal' }) as { error: string }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.error).toMatch(/not allowed/)
  })

  it('rejects a malformed URL', async () => {
    const result = await request({ url: 'not-a-url' }) as { error: string }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.error).toBe('Invalid URL')
  })

  it('injects the server-side secret and discards a model-supplied value for the same field', async () => {
    fetchMock.mockResolvedValue({ results: [] })
    const result = await request({
      url: 'https://hub.ag3nts.org/api/toolsearch',
      body: { apikey: 'model-supplied-fake', query: 'movement rules' }
    }) as { result?: unknown }

    expect(fetchMock).toHaveBeenCalledWith('https://hub.ag3nts.org/api/toolsearch', {
      method: 'POST',
      body: { apikey: 'test-key', query: 'movement rules' },
      headers: undefined
    })
    expect(result.result).toEqual({ results: [] })
  })

  it('shapes fetch errors instead of throwing', async () => {
    fetchMock.mockRejectedValue({ statusCode: 400, statusMessage: 'Bad Request' })
    const result = await request({ url: 'https://hub.ag3nts.org/api/toolsearch', body: { query: 'x' } }) as { error: string, diagnostics: { statusCode: number } }
    expect(result.error).toBe('Bad Request')
    expect(result.diagnostics.statusCode).toBe(400)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a transient 5xx error and succeeds', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce({ statusCode: 503, statusMessage: 'Service Unavailable' })
      .mockResolvedValueOnce({ results: [] })

    const promise = request({ url: 'https://hub.ag3nts.org/api/toolsearch', body: { query: 'x' } })
    await vi.runAllTimersAsync()
    const result = await promise as { result?: unknown }

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.result).toEqual({ results: [] })
    vi.useRealTimers()
  })
})
