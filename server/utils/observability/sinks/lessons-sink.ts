import type { ObservabilitySink, ToolCallEvent } from '../types'

const STORAGE_PREFIX = 'lessons'
const MAX_LESSONS_PER_TOOL = 5

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
  const output = event.output as { error?: unknown } | undefined
  if (output && typeof output === 'object' && !Array.isArray(output) && output.error) {
    return String(output.error)
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
      if (!errorMessage) return

      const inputSnippet = JSON.stringify(event.input).slice(0, 200)
      const note = `Input ${inputSnippet} failed: ${errorMessage}`

      const existing = (await useStorage(STORAGE_PREFIX).getItem<string[]>(event.toolName)) ?? []
      if (existing.includes(note)) return

      const updated = [...existing, note].slice(-MAX_LESSONS_PER_TOOL)
      await useStorage(STORAGE_PREFIX).setItem(event.toolName, updated)
    }
  }
}
