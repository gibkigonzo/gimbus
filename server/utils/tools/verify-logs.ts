import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { z } from 'zod'

const argsSchema = z.object({
  logs: z.string().min(1)
})

export const verifyLogsTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'verify_logs',
    description:
      'Submit formatted incident logs to the verification endpoint and receive feedback from technicians. ' +
      'logs must be a single string with one event per line, separated by \\n. ' +
      'Each line must include: timestamp (YYYY-MM-DD HH:MM), severity level, component ID, and a brief description. ' +
      'Example line: "[2026-02-26 06:04] [CRIT] ECCS8 runaway outlet temp. Protection interlock initiated reactor trip." ' +
      'Keep total log content under 1500 tokens. ' +
      'Returns the server response — if code is non-zero, read the message and resubmit improved logs. ' +
      'Keep iterating until you receive a {FLG:...} flag in the response.',
    parameters: {
      type: 'object',
      properties: {
        logs: {
          type: 'string',
          description:
            'Newline-separated log string. One event per line. Format each line as: [YYYY-MM-DD HH:MM] [LEVEL] COMPONENT_ID description'
        }
      },
      required: ['logs']
    }
  }
}

export async function handleVerifyLogs(rawArgs: Record<string, unknown>, _model: string): Promise<unknown> {
  const { logs } = argsSchema.parse(rawArgs)

  const apikey = process.env.USER_ID ?? ''
  if (!apikey) {
    throw new Error('USER_ID environment variable is not set')
  }

  const body = {
    apikey,
    task: 'failure',
    answer: { logs }
  }

  const response = await fetch('https://hub.ag3nts.org/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  const data = await response.json()
  return data
}
