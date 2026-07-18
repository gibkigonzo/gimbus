import type { Tool } from 'ai'
import type { ToolExecContext } from '#shared/types/tool-runtime'
import { getFailureStreak, DEGRADED_FAILURE_THRESHOLD } from '../observability/sinks/lessons-sink'
import { isToolErrorResult } from './tool-response'

const LESSONS_STORAGE_PREFIX = 'lessons'

/**
 * Wraps a tool's execute() to merge previously-recorded failure notes (written
 * by observability/sinks/lessons-sink.ts on tool-call errors) into its result
 * as a `hints` field, so the model sees "known issues with this tool" without
 * any dynamic data ever touching the (cache-sensitive, static) system prompt.
 *
 * Also merges a `degraded`/`degradedHint` pair when the tool has failed
 * DEGRADED_FAILURE_THRESHOLD times in a row with no intervening success —
 * a stronger steer than a plain hint, applied to every call (live chat and
 * scheduled runs alike) so a likely-dead source gets flagged wherever it's
 * used, not just in the background-task flag message.
 *
 * The degraded streak itself is folded in here rather than read back via
 * isToolDegraded() after the fact: lessons-sink.ts's own streak update runs
 * off ai-sdk's onToolCallFinish telemetry hook, which only fires *after* this
 * execute has already returned — reading isToolDegraded() here would always
 * reflect the streak as of the *previous* call, lagging the current call's
 * own outcome by one (e.g. the 5th consecutive failure itself would still
 * report degraded: false). Combining the prior streak with this call's own
 * isToolErrorResult(output) gets the correct up-to-date value immediately;
 * lessons-sink.ts's independent update afterward computes the same number
 * from the same event, so the two never disagree.
 */
export function withLessons(name: string, tool: Tool): Tool {
  const originalExecute = tool.execute
  if (!originalExecute) return tool

  return {
    ...tool,
    execute: async (args, options) => {
      const output = await originalExecute(args, options)
      const lessons = await useStorage(LESSONS_STORAGE_PREFIX).getItem<string[]>(name)
      const priorStreak = await getFailureStreak(name)
      const currentStreak = isToolErrorResult(output) ? priorStreak + 1 : 0
      const degraded = currentStreak >= DEGRADED_FAILURE_THRESHOLD
      if ((!lessons || lessons.length === 0) && !degraded) return output
      if (output && typeof output === 'object' && !Array.isArray(output)) {
        return {
          ...output,
          ...(lessons && lessons.length > 0 ? { hints: lessons } : {}),
          ...(degraded
            ? { degraded: true, degradedHint: `This tool has failed ${DEGRADED_FAILURE_THRESHOLD}+ times in a row — the underlying source may be down. Consider not retrying it further this turn.` }
            : {})
        }
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
