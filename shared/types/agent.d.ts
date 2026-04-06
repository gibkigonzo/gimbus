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
    | { type: 'text'; text: string }
    | { type: 'tool-result'; toolName: string; result: unknown; toolCalledWith?: string | null }
  >
  /** Model used for this message (assistant only) */
  model?: string | null
  /** Token usage stats (assistant only) */
  inputTokens?: number | null
  outputTokens?: number | null
  cachedTokens?: number | null
}
