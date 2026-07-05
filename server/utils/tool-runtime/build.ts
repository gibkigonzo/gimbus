import type { Tool, ToolSet } from 'ai'
import { createMcpTools } from '../mcp-client'
import { manageTasksTool } from '../tools/tasks'
import { imageProcessTool } from '../tools/image-process'
import { analyzeImageTool } from '../tools/analyze-image'
import { publishForDownloadTool } from '../tools/publish-for-download'
import { hubSubmitAnswerTool } from '../tools/hub-shell'
import { createDelegateHandler } from '../tools/delegate'
import { withLessons, withConfirmation } from './tool-wrappers'

/**
 * Tools flagged here get a per-call human confirm/deny gate (withConfirmation)
 * on top of the existing disabledByDefault scoping — additive defense-in-depth
 * for write-capable/consequential calls, not a replacement for it. Excludes
 * hub_submit_answer deliberately: task loops (e.g. "reactor") drive it with many
 * rapid calls, where per-call confirmation would make it unusable.
 */
const RISKY_TOOL_NAMES = new Set(['write_file', 'edit_file', 'publish_for_download'])

export async function buildToolRuntimeState(): Promise<ToolRuntimeState> {
  const toolsByName = new Map<string, Tool>()
  const catalog: ToolCatalogItem[] = []

  const registerTool = (
    sourceType: ToolSourceType,
    sourceName: string,
    name: string,
    tool: Tool,
    enabledByDefault: boolean,
    wrapOptions?: { collectLessons?: boolean }
  ) => {
    if (toolsByName.has(name)) {
      console.warn(`[tool-runtime] Skipping duplicate tool '${name}' from '${sourceName}'`)
      return
    }

    let wrapped = tool
    if (wrapOptions?.collectLessons) wrapped = withLessons(name, wrapped)
    if (RISKY_TOOL_NAMES.has(name)) wrapped = withConfirmation(name, wrapped)

    toolsByName.set(name, wrapped)

    catalog.push({
      name,
      description: wrapped.description ?? '',
      sourceType,
      sourceName,
      enabledByDefault
    })
  }

  registerTool('builtin', 'built-in', 'manage_tasks', manageTasksTool, true)
  registerTool('builtin', 'built-in', 'image_process', imageProcessTool, true)
  registerTool('builtin', 'built-in', 'analyze_image', analyzeImageTool, true)
  registerTool('builtin', 'built-in', 'publish_for_download', publishForDownloadTool, true)
  registerTool('builtin', 'built-in', 'hub_submit_answer', hubSubmitAnswerTool, false, { collectLessons: true })

  const mcp = await createMcpTools()
  for (const mcpTool of mcp.tools) {
    registerTool('mcp', mcpTool.sourceName, mcpTool.name, mcpTool.tool, mcpTool.enabledByDefault, { collectLessons: true })
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
