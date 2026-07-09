import { describe, it, expect } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import type { ZodTypeAny } from 'zod'
import { thinkTool } from './think'

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

describe('think', () => {
  it('acknowledges a well-formed thought with no side effects', async () => {
    const result = await thinkTool.execute!({ thought: 'I am missing context about the user.' }, toolOptions)
    expect(result).toEqual({ noted: true })
  })

  it('rejects an empty thought', () => {
    const result = (thinkTool.inputSchema as unknown as ZodTypeAny).safeParse({ thought: '' })
    expect(result.success).toBe(false)
  })
})
