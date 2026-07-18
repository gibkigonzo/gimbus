import { tool } from 'ai'
import { z } from 'zod'
import { shapeFetchError } from '../tool-runtime/fetch-error'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'
import { postToVerify } from '../tool-runtime/hub-config'

const submitArgsSchema = z.object({
  task: z.string().min(1).describe('The task name, e.g. "firmware".'),
  answer: z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())])
    .describe('The answer payload — an object like { "confirmation": "ECCS-..." } or an array for tasks like "savethem" that require answer: ["vehicle_name", "right", ...].')
})

export const hubSubmitAnswerTool = tool({
  description: 'Submit the final answer for a hub.ag3nts.org course task to /verify.',
  inputSchema: submitArgsSchema,
  execute: async (args) => {
    try {
      const result = await postToVerify(args.task, args.answer)
      return toolSuccess({ result })
    } catch (err: unknown) {
      const shaped = shapeFetchError(err)
      return toolError(shaped.error, { diagnostics: shaped })
    }
  }
})
