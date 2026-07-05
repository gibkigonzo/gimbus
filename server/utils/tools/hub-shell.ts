import { tool } from 'ai'
import { z } from 'zod'

const SHELL_URL = 'https://hub.ag3nts.org/api/shell'
const VERIFY_URL = 'https://hub.ag3nts.org/verify'

/**
 * /etc, /root, /proc are fixed, always-forbidden paths per the task's own security
 * rules — blocked here in code rather than relying on the model to remember not to
 * touch them. The .gitignore-based blacklist is discovered at runtime inside the VM
 * and can't be pre-checked client-side; that part still depends on the model.
 */
const FORBIDDEN_PATH_PATTERN = /(^|[\s'"])\/(etc|root|proc)(\/|['"]|\s|$)/

interface ShellApiError {
  error: string
  statusCode?: number
  body?: unknown
  retryAfterSeconds?: number
}

function shapeFetchError(err: unknown): ShellApiError {
  const fetchErr = err as { statusCode?: number, statusMessage?: string, data?: unknown, response?: { headers?: Headers } }
  const retryAfterHeader = fetchErr.response?.headers?.get?.('retry-after')
  return {
    error: fetchErr.statusMessage ?? (err as Error).message ?? 'Request failed',
    ...(fetchErr.statusCode !== undefined ? { statusCode: fetchErr.statusCode } : {}),
    ...(fetchErr.data !== undefined ? { body: fetchErr.data } : {}),
    ...(retryAfterHeader ? { retryAfterSeconds: Number(retryAfterHeader) } : {})
  }
}

/**
 * The remote VM behind hub.ag3nts.org/api/shell is a single stateful session tied to
 * one apikey — shared across every chat, not scoped per conversation. Commands must
 * therefore be serialized globally, not left to the model to avoid issuing them in
 * parallel (the agent loop otherwise executes same-step tool calls concurrently).
 */
let shellQueue: Promise<unknown> = Promise.resolve()

function withShellLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = shellQueue.then(fn, fn)
  shellQueue = run.catch(() => {})
  return run
}

const shellArgsSchema = z.object({
  cmd: z.string().min(1).describe('The shell command to execute inside the remote VM. Start with "help" to discover the available command set — it is non-standard.')
})

export const hubShellExecTool = tool({
  description: 'Execute a single command against the remote VM shell at hub.ag3nts.org, one at a time. Returns the command output, or a descriptive error if the API rejects the request (rate limit, ban, 503, etc).',
  inputSchema: shellArgsSchema,
  execute: async (args) => {
    if (FORBIDDEN_PATH_PATTERN.test(args.cmd)) {
      return { error: 'Blocked: command references a restricted path (/etc, /root, or /proc). Not sent.' }
    }

    return withShellLock(async () => {
      try {
        const apikey = process.env.USER_ID ?? ''
        const result = await $fetch(SHELL_URL, {
          method: 'POST',
          body: { apikey, cmd: args.cmd }
        })
        return { result }
      } catch (err: unknown) {
        return shapeFetchError(err)
      }
    })
  }
})

const submitArgsSchema = z.object({
  task: z.string().min(1).describe('The task name, e.g. "firmware".'),
  answer: z.record(z.string(), z.unknown()).describe('The answer payload, e.g. { "confirmation": "ECCS-..." }.')
})

export const hubSubmitAnswerTool = tool({
  description: 'Submit the final answer for a hub.ag3nts.org course task to /verify.',
  inputSchema: submitArgsSchema,
  execute: async (args) => {
    try {
      const apikey = process.env.USER_ID ?? ''
      const result = await $fetch(VERIFY_URL, {
        method: 'POST',
        body: { apikey, task: args.task, answer: args.answer }
      })
      return { result }
    } catch (err: unknown) {
      return shapeFetchError(err)
    }
  }
})
