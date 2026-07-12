/**
 * AgentMessage — local type used for frontend/API responses.
 * Structurally compatible with Nuxt UI UChatMessages props
 * (which expect `parts` array), but does NOT import from 'ai'.
 */
export interface AgentMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  /** Plain text content — same as content field stored in DB */
  content: string
  /** Parts array required by UChatMessages */
  parts: Array<
    | { type: 'text', text: string }
    | { type: 'tool-result', toolName: string, result: unknown, toolCalledWith?: string | null }
  >
  /** Model used for this message (assistant or tool — a tool-only step still reports the model that made the call) */
  model?: string | null
  /** Token usage stats for the step that produced this message (assistant or tool — a step with no text output still has a cost) */
  inputTokens?: number | null
  outputTokens?: number | null
  cachedTokens?: number | null
  /** True when this step's usage came from a finishReason: 'length' step — the model was cut off by maxOutputTokens */
  truncated?: boolean | null
  /** Meaningful only for role 'assistant'/'tool': false means this message is the leftover of a turn cut short by an abort (client Stop / dropped connection) rather than a normal finish — see persist.ts's saveTurn. User rows also carry this column (DB default false) but it has no meaning there — never branch on it for role 'user'. */
  sealed?: boolean | null
}
