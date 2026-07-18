import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', (...args: unknown[]) => fetchMock(...args))

const { fetchWithRetry } = await import('./fetch-retry')

describe('fetchWithRetry', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the result immediately on success without retrying', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    const result = await fetchWithRetry('https://example.com', { method: 'POST' })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries a 5xx error with backoff and eventually succeeds', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce({ statusCode: 503, statusMessage: 'Service Unavailable' })
      .mockRejectedValueOnce({ statusCode: 503, statusMessage: 'Service Unavailable' })
      .mockResolvedValueOnce({ ok: true })

    const promise = fetchWithRetry('https://example.com', { method: 'POST' })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('retries a network error with no statusCode', async () => {
    vi.useFakeTimers()
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true })

    const promise = fetchWithRetry('https://example.com', { method: 'POST' })
    await vi.runAllTimersAsync()
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('honors a numeric Retry-After header on 429', async () => {
    vi.useFakeTimers()
    const headers = new Headers({ 'retry-after': '5' })
    fetchMock
      .mockRejectedValueOnce({ statusCode: 429, statusMessage: 'Too Many Requests', response: { headers } })
      .mockResolvedValueOnce({ ok: true })

    const promise = fetchWithRetry('https://example.com', { method: 'POST' })
    // Nothing should resolve before the 5s Retry-After delay elapses.
    await vi.advanceTimersByTimeAsync(4999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry a non-retryable 4xx error', async () => {
    fetchMock.mockRejectedValue({ statusCode: 400, statusMessage: 'Bad Request' })
    await expect(fetchWithRetry('https://example.com', { method: 'POST' })).rejects.toMatchObject({ statusCode: 400 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('gives up and throws after exhausting retries', async () => {
    vi.useFakeTimers()
    fetchMock.mockRejectedValue({ statusCode: 503, statusMessage: 'Service Unavailable' })

    const promise = fetchWithRetry('https://example.com', { method: 'POST' }, { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 20 })
    const expectation = expect(promise).rejects.toMatchObject({ statusCode: 503 })
    await vi.runAllTimersAsync()
    await expectation
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
