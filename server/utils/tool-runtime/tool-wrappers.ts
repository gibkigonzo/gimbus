import type { Tool } from 'ai'
import type { ToolExecContext } from '#shared/types/tool-runtime'

const LESSONS_STORAGE_PREFIX = 'lessons'

/**
 * Wraps a tool's execute() to merge previously-recorded failure notes (written
 * by observability/sinks/lessons-sink.ts on tool-call errors) into its result
 * as a `hints` field, so the model sees "known issues with this tool" without
 * any dynamic data ever touching the (cache-sensitive, static) system prompt.
 */
export function withLessons(name: string, tool: Tool): Tool {
  const originalExecute = tool.execute
  if (!originalExecute) return tool

  return {
    ...tool,
    execute: async (args, options) => {
      const output = await originalExecute(args, options)
      const lessons = await useStorage(LESSONS_STORAGE_PREFIX).getItem<string[]>(name)
      if (!lessons || lessons.length === 0) return output
      if (output && typeof output === 'object' && !Array.isArray(output)) {
        return { ...output, hints: lessons }
      }
      return output
    }
  } as Tool
}

/**
 * Wraps a tool's execute() to pause before running and ask the user to
 * confirm/deny the call. `requestConfirmation` is threaded through per-turn
 * via `experimental_context` (see core-loop.ts) rather than closed over here,
 * since this wrapper is applied once at process-startup tool registration
 * (build.ts) while the confirmation channel is per-request.
 */
export function withConfirmation(name: string, tool: Tool): Tool {
  const originalExecute = tool.execute
  if (!originalExecute) return tool

  return {
    ...tool,
    execute: async (args, options) => {
      const requestConfirmation = (options.experimental_context as ToolExecContext | undefined)?.requestConfirmation
      if (requestConfirmation) {
        const approved = await requestConfirmation(name, args)
        if (!approved) return { error: 'Rejected by user' }
      }
      return originalExecute(args, options)
    }
  } as Tool
}
