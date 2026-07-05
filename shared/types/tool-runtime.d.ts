import type { ToolSet } from 'ai'

export type ToolSourceType = 'builtin' | 'mcp'

/** Shape passed as `experimental_context` to every tool's execute() — carries the request's model id and tracing identifiers. */
export interface ToolExecContext {
  model: string
  chatId?: string
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
  close: () => Promise<void>
}
