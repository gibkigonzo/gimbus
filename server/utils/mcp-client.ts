import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type OpenAI from 'openai'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

interface McpServerExtended {
  allowTools?: string[]
  disabledByDefault?: string[]
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
  tool: OpenAI.Chat.Completions.ChatCompletionTool
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
  handlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>
  close: () => Promise<void>
}

/**
 * Reads mcp.json from server/utils/, spawns all configured MCP servers via stdio,
 * discovers their tools, and returns them merged as OpenAI-compatible tool definitions + handlers.
 *
 * The cwd for spawned servers is the project root (process.cwd()), so relative paths
 * in mcp.json args (e.g. "./playground") resolve relative to the project root.
 */
export async function createMcpTools(): Promise<McpToolset> {
  const mcpConfigPath = resolve(process.cwd(), 'mcp.json')

  const raw = await readFile(mcpConfigPath, 'utf-8')
  const config: McpConfig = JSON.parse(raw)

  const allTools: McpRuntimeTool[] = []
  const allHandlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>> = {}
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

    const openAiTools = mcpTools
      .map((tool): OpenAI.Chat.Completions.ChatCompletionTool => {
        const descriptionOverride = serverConfig.extended?.descriptionOverrides?.[tool.name]
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: descriptionOverride ?? tool.description ?? '',
            parameters: tool.inputSchema as Record<string, unknown>
          }
        }
      })
      .filter((tool) => {
        if (!serverConfig.extended?.allowTools) return true
        return serverConfig.extended.allowTools.includes(tool.function.name)
      })

    console.log(`[mcp-client] Discovered tools (${serverName}): ${openAiTools.map(t => t.function.name).join(', ')}`)
    allTools.push(...openAiTools.map(tool => ({
      sourceName: serverName,
      tool,
      enabledByDefault: !disabledByDefault.has(tool.function.name)
    })))

    const allowedNames = new Set(openAiTools.map(t => t.function.name))
    for (const tool of mcpTools) {
      if (!allowedNames.has(tool.name)) continue
      allHandlers[tool.name] = async (args: Record<string, unknown>, _model: string) => {
        const result = await client.callTool({ name: tool.name, arguments: args })
        const parts = result.content as McpContentPart[]
        return parts.map(p => p.text ?? p.data ?? '').join('\n')
      }
    }
  }

  return {
    tools: allTools,
    handlers: allHandlers,
    close: async () => {
      for (const { client, name } of clients) {
        await client.close()
        console.log(`[mcp-client] Shutdown complete: ${name}`)
      }
    }
  }
}
