import type { ToolSet } from 'ai'

export type ToolSourceType = 'builtin' | 'mcp'

/** Shape passed as `experimental_context` to every tool's execute() — carries the request's model id and tracing identifiers. */
export interface ToolExecContext {
  model: string
  chatId?: string
  /** Pauses the turn, asks the user to confirm/deny this call over SSE, and resolves once they respond (or it times out). Only present on the main turn's context — see withConfirmation() in tool-runtime/tool-wrappers.ts. */
  requestConfirmation?: (toolName: string, input: unknown) => Promise<boolean>
}

export interface ToolCatalogItem {
  name: string
  description: string
  sourceType: ToolSourceType
  sourceName: string
  enabledByDefault: boolean
}

export interface ToolRuntimeState {
  tools: ToolSet
  catalog: ToolCatalogItem[]
  defaultEnabledToolNames: string[]
  /**
   * Tool names granted to a registered sub-agent (delegate.ts, or an
   * @mention-routed turn in chats/[id].post.ts) that omits its own
   * `allowTools` — computed once here so both call sites share one policy
   * instead of independently re-deriving it. Allowlist-based (catalog's own
   * `enabledByDefault`, minus RISKY_TOOL_NAMES) rather than a blocklist, so a
   * tool that's `enabledByDefault: false` (e.g. hub_submit_answer,
   * http_request, run_code) is excluded automatically without needing to be
   * named here by hand.
   */
  defaultSubAgentToolNames: string[]
  close: () => Promise<void>
}
