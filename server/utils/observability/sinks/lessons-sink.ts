import type { ObservabilitySink, ToolCallEvent } from '../types'
import { isToolErrorResult } from '../../tool-runtime/tool-response'

const STORAGE_PREFIX = 'lessons'
const MAX_LESSONS_PER_TOOL = 5

// Separate KV prefix (not the notes list above) tracking a rolling
// consecutive-failure count per tool, used to detect a persistently broken
// external source rather than a one-off blip. Reset to 0 on any success —
// auto-recovery, since a transient outage shouldn't leave a tool permanently
// flagged once its source comes back.
const STREAK_STORAGE_PREFIX = 'lessons-streak'
export const DEGRADED_FAILURE_THRESHOLD = 5

/**
 * Raw consecutive-failure count for a tool, 0 if none recorded. Exported (not
 * just the boolean isToolDegraded below) so withLessons() (tool-wrappers.ts)
 * can fold in the call it's currently handling — this async telemetry-driven
 * update (see onToolCall below) only lands *after* that call's own execute
 * has already returned, so a caller that needs an up-to-the-current-call
 * answer must combine this prior count with its own knowledge of whether the
 * current call just failed, rather than relying on isToolDegraded() alone.
 */
export async function getFailureStreak(toolName: string): Promise<number> {
  return (await useStorage(STREAK_STORAGE_PREFIX).getItem<number>(toolName)) ?? 0
}

/**
 * True once a tool has failed DEGRADED_FAILURE_THRESHOLD times in a row with
 * no intervening success. Read by scheduled-task-runner.ts to name the
 * culprit in a failed/degraded run's flag message, using the streak as it
 * stands after that turn's calls have already been recorded. Deliberately
 * not used to disable the tool outright — see scheduled-task-review.ts's
 * sibling caveat: a transient streak shouldn't silently blind an unrelated
 * future conversation.
 */
export async function isToolDegraded(toolName: string): Promise<boolean> {
  return (await getFailureStreak(toolName)) >= DEGRADED_FAILURE_THRESHOLD
}

/**
 * Tools in this codebase self-catch and resolve with `{ error }` rather than
 * throwing (see CLAUDE.md conventions) — so ai-sdk's own success/error split
 * on the telemetry event is almost never set. The real signal is an `error`
 * field on the tool's own output.
 */
function extractErrorMessage(event: ToolCallEvent): string | undefined {
  if (event.error) {
    return String((event.error as Error)?.message ?? event.error)
  }
  if (isToolErrorResult(event.output)) {
    return String(event.output.error)
  }
  return undefined
}

/**
 * Persists a short, deduplicated, capped list of recent failure notes per tool
 * name — read back by `withLessons()` (tool-runtime/tool-wrappers.ts) and
 * merged into that tool's next result as a `hints` field.
 */
export function createLessonsSink(): ObservabilitySink {
  return {
    async onToolCall(event) {
      const errorMessage = extractErrorMessage(event)
      const streakStore = useStorage(STREAK_STORAGE_PREFIX)

      if (!errorMessage) {
        await streakStore.setItem(event.toolName, 0)
        return
      }

      const streak = ((await streakStore.getItem<number>(event.toolName)) ?? 0) + 1
      await streakStore.setItem(event.toolName, streak)

      const inputSnippet = JSON.stringify(event.input).slice(0, 200)
      const note = `Input ${inputSnippet} failed: ${errorMessage}`

      const existing = (await useStorage(STORAGE_PREFIX).getItem<string[]>(event.toolName)) ?? []
      if (existing.includes(note)) return

      const updated = [...existing, note].slice(-MAX_LESSONS_PER_TOOL)
      await useStorage(STORAGE_PREFIX).setItem(event.toolName, updated)
    }
  }
}
