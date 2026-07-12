import type { Tool, ToolSet } from 'ai'
import { createMcpTools } from '../mcp-client'
import { manageTasksTool } from '../tools/tasks'
import { imageProcessTool } from '../tools/image-process'
import { analyzeImageTool } from '../tools/analyze-image'
import { publishForDownloadTool } from '../tools/publish-for-download'
import { grepFilesTool } from '../tools/search-file-contents'
import { hubSubmitAnswerTool } from '../tools/hub'
import { thinkTool } from '../tools/think'
import { httpRequestTool } from '../tools/http-request'
import { runCodeTool } from '../tools/run-code'
import { recallTool, rememberTool } from '../tools/memory'
import { createDelegateHandler } from '../tools/delegate'
import { withLessons, withConfirmation } from './tool-wrappers'

/**
 * Tools flagged here get a per-call human confirm/deny gate (withConfirmation)
 * on top of the existing disabledByDefault scoping — additive defense-in-depth
 * for write-capable/consequential calls, not a replacement for it.
 *
 * `remember` is included because `memories` is global (cross-chat, not scoped
 * by chatId) and its content — including the agent's own persona/mood/opinions
 * — is read back by `recall` and woven into future responses per the Identity
 * system-prompt section; an unconfirmed write here is a standing prompt-injection
 * target with a blast radius spanning every future conversation, not just the
 * current one.
 *
 * Deliberately excludes hub_submit_answer and http_request: both are driven in
 * tight loops for some tasks (e.g. "reactor", and the toolsearch-discovery flow
 * hitting many hub.ag3nts.org endpoints in quick succession) where per-call
 * confirmation would make them unusable. http_request's blast radius is instead
 * bounded by its server-side host allowlist and secret-injection registry
 * (see http-request.ts) rather than a confirmation gate.
 *
 * `run_code` is included because arbitrary script execution has real (if
 * playground-jailed) blast radius. Exported so callers with no live human to
 * confirm anything — e.g. a scheduled Nitro task, see server/tasks/agent/ —
 * can filter these out of their active tool set up front, rather than letting
 * a call stall for withConfirmation's timeout and then auto-deny.
 */
export const RISKY_TOOL_NAMES = new Set(['write_file', 'edit_file', 'publish_for_download', 'remember', 'run_code'])

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
  registerTool('builtin', 'built-in', 'grep_files', grepFilesTool, true)
  registerTool('builtin', 'built-in', 'hub_submit_answer', hubSubmitAnswerTool, false, { collectLessons: true })
  registerTool('builtin', 'built-in', 'think', thinkTool, true)
  registerTool('builtin', 'built-in', 'recall', recallTool, true)
  registerTool('builtin', 'built-in', 'remember', rememberTool, true)
  registerTool('builtin', 'built-in', 'http_request', httpRequestTool, false, { collectLessons: true })
  registerTool('builtin', 'built-in', 'run_code', runCodeTool, false, { collectLessons: true })

  const mcp = await createMcpTools()
  for (const mcpTool of mcp.tools) {
    registerTool('mcp', mcpTool.sourceName, mcpTool.name, mcpTool.tool, mcpTool.enabledByDefault, { collectLessons: true })
  }

  // delegate must be registered last — its handler closes over the complete tool set.
  // The name list passed here is only used as the *implicit* tool set for a
  // sub-agent whose registry entry omits `allowTools` — RISKY_TOOL_NAMES and
  // http_request are excluded from that implicit grant so a future agent type
  // that forgets to set `allowTools` doesn't silently inherit write-capable,
  // persona-writing, or secret-injecting tools. An agent definition that needs
  // one of these can still list it explicitly in its own `allowTools`.
  const delegateTool = createDelegateHandler(
    Object.fromEntries(toolsByName) as ToolSet,
    Array.from(toolsByName.keys()).filter(name => !RISKY_TOOL_NAMES.has(name) && name !== 'http_request')
  )
  registerTool('builtin', 'built-in', 'delegate', delegateTool, false)

  return {
    tools: Object.fromEntries(toolsByName) as ToolSet,
    catalog,
    defaultEnabledToolNames: catalog.filter(t => t.enabledByDefault).map(t => t.name),
    close: mcp.close
  }
}
