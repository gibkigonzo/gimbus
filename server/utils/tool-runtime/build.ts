import type { Tool, ToolSet } from 'ai'
import { createMcpTools } from '../mcp-client'
import { manageTasksTool } from '../tools/tasks'
import { imageProcessTool } from '../tools/image-process'
import { analyzeImageTool } from '../tools/analyze-image'
import { publishForDownloadTool } from '../tools/publish-for-download'
import { createDelegateHandler } from '../tools/delegate'

export async function buildToolRuntimeState(): Promise<ToolRuntimeState> {
  const toolsByName = new Map<string, Tool>()
  const catalog: ToolCatalogItem[] = []

  const registerTool = (
    sourceType: ToolSourceType,
    sourceName: string,
    name: string,
    tool: Tool,
    enabledByDefault: boolean
  ) => {
    if (toolsByName.has(name)) {
      console.warn(`[tool-runtime] Skipping duplicate tool '${name}' from '${sourceName}'`)
      return
    }

    toolsByName.set(name, tool)

    catalog.push({
      name,
      description: tool.description ?? '',
      sourceType,
      sourceName,
      enabledByDefault
    })
  }

  registerTool('builtin', 'built-in', 'manage_tasks', manageTasksTool, true)
  registerTool('builtin', 'built-in', 'image_process', imageProcessTool, true)
  registerTool('builtin', 'built-in', 'analyze_image', analyzeImageTool, true)
  registerTool('builtin', 'built-in', 'publish_for_download', publishForDownloadTool, true)

  const mcp = await createMcpTools()
  for (const mcpTool of mcp.tools) {
    registerTool('mcp', mcpTool.sourceName, mcpTool.name, mcpTool.tool, mcpTool.enabledByDefault)
  }

  // delegate must be registered last — its handler closes over the complete tool set
  const delegateTool = createDelegateHandler(
    Object.fromEntries(toolsByName) as ToolSet,
    Array.from(toolsByName.keys())
  )
  registerTool('builtin', 'built-in', 'delegate', delegateTool, false)

  return {
    tools: Object.fromEntries(toolsByName) as ToolSet,
    catalog,
    defaultEnabledToolNames: catalog.filter(t => t.enabledByDefault).map(t => t.name),
    close: mcp.close
  }
}
