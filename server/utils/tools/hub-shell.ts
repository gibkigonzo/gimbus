import { tool } from 'ai'
import { z } from 'zod'

const VERIFY_URL = 'https://hub.ag3nts.org/verify'

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
