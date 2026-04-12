import type { ChatCompletionTool } from 'openai/resources/chat/completions'

interface ResolvedToolSelection {
  tools: ChatCompletionTool[]
  handlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>
}

export function resolveToolsByAllowList(
  allTools: ChatCompletionTool[],
  allHandlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>,
  defaultEnabledToolNames: string[],
  allowTools?: string[]
): ResolvedToolSelection {
  const names = new Set(allowTools ?? defaultEnabledToolNames)
  const tools = allTools.filter(tool => names.has(tool.function.name))
  const handlers = Object.fromEntries(
    Object.entries(allHandlers).filter(([name]) => names.has(name))
  )

  return { tools, handlers }
}
