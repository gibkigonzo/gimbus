/**
 * Shared response-shape convention for built-in tools, generalizing the ad hoc
 * pattern already used by fetch-error.ts's shapeFetchError (spread optional
 * fields onto a required core field). `error` stays the primary/required field
 * on failure (matches every existing tool's `{ error }` shape and the
 * project's "execute must self-catch" convention); `next_action`/`recovery`/
 * `diagnostics` are additive so the agent always has a next step instead of a
 * bare success/failure.
 */

export function toolSuccess<T extends object>(data: T, opts?: { nextAction?: string }): T & { next_action?: string } {
  return { ...data, ...(opts?.nextAction ? { next_action: opts.nextAction } : {}) }
}

export interface ToolErrorResult {
  error: string
  recovery?: string
  diagnostics?: unknown
}

export function toolError(message: string, opts?: { recovery?: string, diagnostics?: unknown }): ToolErrorResult {
  return {
    error: message,
    ...(opts?.recovery ? { recovery: opts.recovery } : {}),
    ...(opts?.diagnostics !== undefined ? { diagnostics: opts.diagnostics } : {})
  }
}

/** Type guard for the `{ error }` shape every tool's execute() resolves with
 * on failure (see this file's own convention above) — shared by
 * lessons-sink.ts (deciding whether a completed call was a failure) and
 * tool-wrappers.ts (computing this same call's own contribution to the
 * failure streak, without waiting on the async telemetry round trip that
 * lessons-sink's own streak update runs on). */
export function isToolErrorResult(output: unknown): output is ToolErrorResult {
  return !!output && typeof output === 'object' && !Array.isArray(output) && !!(output as { error?: unknown }).error
}
