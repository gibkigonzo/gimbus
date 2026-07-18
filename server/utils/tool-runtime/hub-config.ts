import { fetchWithRetry } from './fetch-retry'

/**
 * Single source of truth for how tools authenticate to hub.ag3nts.org.
 * Shared by `hub.ts` (hub_submit_answer) and `http-request.ts` so the
 * host/env-var mapping only needs to change in one place if it's ever rotated.
 */
export const HUB_HOST = 'hub.ag3nts.org'
export const HUB_APIKEY_ENV_VAR = 'USER_ID'

/**
 * POST {apikey, task, answer} to /verify with retry-on-transient-failure —
 * the shape every hub.ag3nts.org course task's submission/RPC call shares.
 * Factored out of hub.ts's own execute so any future tool driving many rapid
 * calls per turn (not just one final answer) doesn't duplicate the request shape.
 */
export function postToVerify<T = unknown>(task: string, answer: unknown): Promise<T> {
  const apikey = process.env[HUB_APIKEY_ENV_VAR] ?? ''
  return fetchWithRetry<T>(`https://${HUB_HOST}/verify`, {
    method: 'POST',
    body: { apikey, task, answer }
  })
}
