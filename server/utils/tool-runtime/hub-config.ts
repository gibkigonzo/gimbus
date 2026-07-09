/**
 * Single source of truth for how tools authenticate to hub.ag3nts.org.
 * Shared by `hub.ts` (hub_submit_answer) and `http-request.ts` so the
 * host/env-var mapping only needs to change in one place if it's ever rotated.
 */
export const HUB_HOST = 'hub.ag3nts.org'
export const HUB_APIKEY_ENV_VAR = 'USER_ID'
