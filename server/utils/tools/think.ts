import { tool } from 'ai'
import { z } from 'zod'

const argsSchema = z.object({
  thought: z.string().min(1).describe('Reasoning to externalize before acting — what you know, what is uncertain, and what you are about to try and why.')
})

export const thinkTool = tool({
  description:
    'Externalize your reasoning before acting, especially when you notice a gap between what you know and what you would need to know to respond well. This tool has no side effects and does not look anything up — calling it is the point, not its return value. Use it to slow down and notice uncertainty before answering or choosing another tool.',
  inputSchema: argsSchema,
  execute: async () => {
    return { noted: true }
  }
})
