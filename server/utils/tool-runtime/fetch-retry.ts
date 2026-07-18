import { shapeFetchError } from './fetch-error'

export interface FetchRetryOptions {
  maxRetries?: number
  baseDelayMs?: number
  maxDelayMs?: number
}

const DEFAULT_MAX_RETRIES = 3
const DEFAULT_BASE_DELAY_MS = 1000
const DEFAULT_MAX_DELAY_MS = 8000

/** No statusCode means the request never got an HTTP response at all (timeout/network error) — treat as transient. */
function isRetryableStatus(statusCode: number | undefined): boolean {
  if (statusCode === undefined) return true
  if (statusCode === 429) return true
  return statusCode >= 500
}

/** AWS's decorrelated jitter: sleep = random_between(base, previousSleep * 3), capped. */
function decorrelatedJitterMs(previousDelayMs: number, baseDelayMs: number, maxDelayMs: number): number {
  const upperBound = Math.min(maxDelayMs, previousDelayMs * 3)
  return baseDelayMs + Math.random() * Math.max(0, upperBound - baseDelayMs)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Untyped view of $fetch for use inside this generic wrapper — callers pass
 * full external URLs (not internal app routes), so Nuxt's typed-route
 * inference over `url: string` inside a generic function only adds cost here
 * (it blows up into a TS2321 "excessive stack depth" against the app's route
 * map) with no type-safety benefit.
 *
 * Must stay a function, not a module-scope `const` — $fetch is a Nitro
 * runtime global that isn't attached yet while this module's top-level code
 * is evaluated during startup; referencing it eagerly at module scope throws
 * "$fetch is not defined". Every other call site in this project only
 * touches $fetch from inside a function body (e.g. a tool's execute) for the
 * same reason.
 */
function plainFetch(url: string, options?: Record<string, unknown>): Promise<unknown> {
  return ($fetch as unknown as (url: string, options?: Record<string, unknown>) => Promise<unknown>)(url, options)
}

/**
 * Wraps $fetch with retry-on-transient-failure: network errors, 5xx, and 429
 * are retried with decorrelated-jitter backoff (honoring a numeric
 * Retry-After header on 429s when present); any other 4xx fails immediately
 * since retrying a rejected/invalid request can't change the outcome.
 */
export async function fetchWithRetry<T = unknown>(
  url: string,
  fetchOptions: Record<string, unknown>,
  retryOptions?: FetchRetryOptions
): Promise<T> {
  const maxRetries = retryOptions?.maxRetries ?? DEFAULT_MAX_RETRIES
  const baseDelayMs = retryOptions?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const maxDelayMs = retryOptions?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS

  let previousDelayMs = baseDelayMs

  for (let attempt = 0; ; attempt++) {
    try {
      return await plainFetch(url, fetchOptions) as T
    } catch (err) {
      const shaped = shapeFetchError(err)
      if (attempt >= maxRetries || !isRetryableStatus(shaped.statusCode)) throw err

      const delayMs = shaped.statusCode === 429 && shaped.retryAfterSeconds !== undefined
        ? shaped.retryAfterSeconds * 1000
        : decorrelatedJitterMs(previousDelayMs, baseDelayMs, maxDelayMs)
      previousDelayMs = delayMs
      await sleep(delayMs)
    }
  }
}
