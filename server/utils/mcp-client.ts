import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { dynamicTool, jsonSchema } from 'ai'
import type { Tool, JSONSchema7 } from 'ai'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { ToolExecContext } from '#shared/types/tool-runtime'
import { ALWAYS_ALLOWED_PREFIXES, getAllowedPlaygroundPrefixes, isPathAllowed, toServerRelativePath } from './tool-runtime/playground-scope'

interface McpServerExtended {
  allowTools?: string[]
  disabledByDefault?: string[]
  scopedPathArgs?: Record<string, string>
  descriptionOverrides?: Record<string, string>
}

interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
  extended?: McpServerExtended
}

interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

interface McpRuntimeTool {
  sourceName: string
  name: string
  tool: Tool
  enabledByDefault: boolean
}

interface McpClientRef {
  client: Client
  name: string
}

interface McpContentPart {
  type: string
  text?: string
  data?: string
}

export interface McpToolset {
  tools: McpRuntimeTool[]
  close: () => Promise<void>
}

/**
 * Reads mcp.json from server/utils/, spawns all configured MCP servers via stdio,
 * discovers their tools, and returns them merged as ai-sdk dynamicTool()s.
 *
 * The cwd for spawned servers is the project root (process.cwd()), so relative paths
 * in mcp.json args (e.g. "./playground") resolve relative to the project root.
 */
export async function createMcpTools(): Promise<McpToolset> {
  const mcpConfigPath = resolve(process.cwd(), 'mcp.json')

  const raw = await readFile(mcpConfigPath, 'utf-8')
  const config: McpConfig = JSON.parse(raw)

  const allTools: McpRuntimeTool[] = []
  const clients: McpClientRef[] = []

  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    console.log(`[mcp-client] Starting MCP server: ${serverName}`)

    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      env: {
        ...process.env,
        ...(serverConfig.env ?? {})
      } as Record<string, string>,
      cwd: process.cwd()
    })

    const client = new Client({ name: 'mcp-client', version: '1.0.0' })
    await client.connect(transport)
    console.log(`[mcp-client] Connected to ${serverName}`)
    clients.push({ client, name: serverName })

    const { tools: mcpTools } = await client.listTools()

    const disabledByDefault = new Set(serverConfig.extended?.disabledByDefault ?? [])
    const scopedPathArgs = serverConfig.extended?.scopedPathArgs ?? {}

    const filteredMcpTools = mcpTools.filter((mcpTool) => {
      if (!serverConfig.extended?.allowTools) return true
      return serverConfig.extended.allowTools.includes(mcpTool.name)
    })

    const runtimeTools = filteredMcpTools.map((mcpTool): McpRuntimeTool => {
      const descriptionOverride = serverConfig.extended?.descriptionOverrides?.[mcpTool.name]
      const pathArgKey = scopedPathArgs[mcpTool.name]
      const toolObj = dynamicTool({
        description: descriptionOverride ?? mcpTool.description ?? '',
        inputSchema: jsonSchema(mcpTool.inputSchema as JSONSchema7),
        execute: async (args, { experimental_context }) => {
          let forwardedArgs = args as Record<string, unknown>
          if (pathArgKey) {
            const path = forwardedArgs[pathArgKey]
            if (typeof path === 'string') {
              const chatId = (experimental_context as ToolExecContext | undefined)?.chatId
              const allowedPrefixes = chatId ? await getAllowedPlaygroundPrefixes(chatId) : ALWAYS_ALLOWED_PREFIXES
              if (!isPathAllowed(path, allowedPrefixes)) {
                return { error: 'Access denied: path is outside this chat\'s scope. Use the exact pathname from the <attachments> block or ./playground/workflows/.' }
              }
              // Scope-checked against the "playground/"-prefixed form above (matching
              // every other convention) — only the copy actually sent to the server
              // (rooted at ./playground itself, per mcp.json) gets that prefix stripped.
              forwardedArgs = { ...forwardedArgs, [pathArgKey]: toServerRelativePath(path) }
            }
          }
          const result = await client.callTool({ name: mcpTool.name, arguments: forwardedArgs })
          const parts = result.content as McpContentPart[]
          return parts.map(p => p.text ?? p.data ?? '').join('\n')
        }
      })
      return {
        sourceName: serverName,
        name: mcpTool.name,
        tool: toolObj,
        enabledByDefault: !disabledByDefault.has(mcpTool.name)
      }
    })

    console.log(`[mcp-client] Discovered tools (${serverName}): ${runtimeTools.map(t => t.name).join(', ')}`)
    allTools.push(...runtimeTools)
  }

  return {
    tools: allTools,
    close: async () => {
      for (const { client, name } of clients) {
        await client.close()
        console.log(`[mcp-client] Shutdown complete: ${name}`)
      }
    }
  }
}
