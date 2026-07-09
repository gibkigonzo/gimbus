export interface FetchApiError {
  error: string
  statusCode?: number
  body?: unknown
  retryAfterSeconds?: number
}

export function shapeFetchError(err: unknown): FetchApiError {
  const fetchErr = err as { statusCode?: number, statusMessage?: string, data?: unknown, response?: { headers?: Headers } }
  const retryAfterHeader = fetchErr.response?.headers?.get?.('retry-after')
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined
  return {
    error: fetchErr.statusMessage ?? (err as Error).message ?? 'Request failed',
    ...(fetchErr.statusCode !== undefined ? { statusCode: fetchErr.statusCode } : {}),
    ...(fetchErr.data !== undefined ? { body: fetchErr.data } : {}),
    // Retry-After may also be an HTTP-date (RFC 9110), which Number() can't parse — only
    // surface it when it's the plain delta-seconds form, rather than leaking a NaN.
    ...(retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {})
  }
}
