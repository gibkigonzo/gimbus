import { tool } from 'ai'
import { z } from 'zod'
import { shapeFetchError } from '../tool-runtime/fetch-error'
import { fetchWithRetry } from '../tool-runtime/fetch-retry'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'
import { HUB_HOST, HUB_APIKEY_ENV_VAR } from '../tool-runtime/hub-config'

/** Server-side allowlist of hosts this tool may reach — the model can never expand it. */
const ALLOWED_HOSTS = new Set([HUB_HOST])

/**
 * Per-host secret injection: the named body field is always overwritten with
 * process.env[envVar] before the request goes out, so the model can supply
 * (or omit) that field but never actually control or see its real value.
 */
const SECRET_INJECTION: Record<string, { envVar: string, field: string }> = {
  [HUB_HOST]: { envVar: HUB_APIKEY_ENV_VAR, field: 'apikey' }
}

const argsSchema = z.object({
  url: z.string().url().describe('Full HTTPS URL to request. Host must be on the server allowlist (e.g. hub.ag3nts.org) — others are rejected.'),
  body: z.record(z.string(), z.unknown()).optional().describe('JSON body for the POST request. Fields auto-injected server-side for this host (e.g. API keys) are always overwritten even if you set them.'),
  headers: z.record(z.string(), z.string()).optional().describe('Additional request headers, e.g. {"Content-Type": "application/json"}.')
})

export const httpRequestTool = tool({
  description: 'Make a POST request with a JSON body to an allowlisted external host. Used to call APIs discovered at runtime (e.g. a tool-search endpoint and the tools it returns). Only a fixed set of hosts are reachable; secrets for those hosts (if any) are injected automatically and cannot be overridden.',
  inputSchema: argsSchema,
  execute: async (args) => {
    let hostname: string
    try {
      hostname = new URL(args.url).hostname
    } catch {
      return toolError('Invalid URL')
    }

    if (!ALLOWED_HOSTS.has(hostname)) {
      return toolError(`Host "${hostname}" is not allowed.`, {
        recovery: `Allowed hosts: ${Array.from(ALLOWED_HOSTS).join(', ')}`
      })
    }

    const body: Record<string, unknown> = { ...(args.body ?? {}) }
    const injection = SECRET_INJECTION[hostname]
    if (injection) {
      body[injection.field] = process.env[injection.envVar] ?? ''
    }

    try {
      const result = await fetchWithRetry(args.url, {
        method: 'POST',
        body,
        headers: args.headers
      })
      return toolSuccess({ result })
    } catch (err: unknown) {
      const shaped = shapeFetchError(err)
      return toolError(shaped.error, { diagnostics: shaped })
    }
  }
})
