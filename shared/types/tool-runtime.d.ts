import type OpenAI from 'openai'

export type ToolSourceType = 'builtin' | 'mcp' | 'workflow'

export interface ToolCatalogItem {
  name: string
  description: string
  sourceType: ToolSourceType
  sourceName: string
  enabledByDefault: boolean
}

export interface ToolRuntimeState {
  tools: OpenAI.Chat.Completions.ChatCompletionTool[]
  handlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>
  catalog: ToolCatalogItem[]
  defaultEnabledToolNames: string[]
  close: () => Promise<void>
}
