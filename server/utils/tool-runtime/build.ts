import type OpenAI from 'openai'
import { createMcpTools } from '../mcp-client'
import { manageTasksTool, handleManageTasks } from '../tools/tasks'
import { imageProcessTool, handleImageProcess } from '../tools/image-process'
import { analyzeImageTool, handleAnalyzeImage } from '../tools/analyze-image'
import { publishForDownloadTool, handlePublishForDownload } from '../tools/publish-for-download'

export async function buildToolRuntimeState(): Promise<ToolRuntimeState> {
  const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {}
  const toolsByName = new Map<string, OpenAI.Chat.Completions.ChatCompletionTool>()
  const catalog: ToolCatalogItem[] = []

  const registerTool = (
    sourceType: ToolSourceType,
    sourceName: string,
    tool: OpenAI.Chat.Completions.ChatCompletionTool,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
    enabledByDefault: boolean
  ) => {
    const toolName = tool.function.name
    if (toolsByName.has(toolName)) {
      console.warn(`[tool-runtime] Skipping duplicate tool '${toolName}' from '${sourceName}'`)
      return
    }

    toolsByName.set(toolName, tool)
    handlers[toolName] = handler

    catalog.push({
      name: toolName,
      description: tool.function.description ?? '',
      sourceType,
      sourceName,
      enabledByDefault
    })
  }

  registerTool('builtin', 'built-in', manageTasksTool, handleManageTasks, true)
  registerTool('builtin', 'built-in', imageProcessTool, handleImageProcess, true)
  registerTool('builtin', 'built-in', analyzeImageTool, handleAnalyzeImage, true)
  registerTool('builtin', 'built-in', publishForDownloadTool, handlePublishForDownload, true)

  const mcp = await createMcpTools()
  for (const mcpTool of mcp.tools) {
    const handler = mcp.handlers[mcpTool.tool.function.name]
    if (!handler) continue
    registerTool('mcp', mcpTool.sourceName, mcpTool.tool, handler, mcpTool.enabledByDefault)
  }

  return {
    tools: Array.from(toolsByName.values()),
    handlers,
    catalog,
    defaultEnabledToolNames: catalog.filter(t => t.enabledByDefault).map(t => t.name),
    close: mcp.close
  }
}
