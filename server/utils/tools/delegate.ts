import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import type { LoopContext } from '#shared/types/agent-runtime'
import { runAgentLoopCore } from '../agent/core-loop'
import { resolveToolsByAllowList } from '../agent/tool-selection'
import { AGENT_REGISTRY } from './delegate-agents'

const agentNames = Object.keys(AGENT_REGISTRY)
const agentDescriptionList = agentNames
  .map(name => `${name} — ${AGENT_REGISTRY[name]!.description}`)
  .join('; ')

export const delegateTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'delegate',
    description: `Spawn one or more sub-agents in parallel and return their outputs. Each agent has a fixed system prompt and tool set defined by the developer. Available agents: ${agentDescriptionList}`,
    parameters: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          description: 'List of sub-agent tasks to run in parallel.',
          items: {
            type: 'object',
            properties: {
              agentName: {
                type: 'string',
                enum: agentNames,
                description: `Name of the agent to spawn. Available: ${agentDescriptionList}`
              },
              message: {
                type: 'string',
                description: 'The task instruction passed as the user message to the sub-agent.'
              },
              id: {
                type: 'string',
                description: 'Optional correlation ID returned alongside the result.'
              },
              model: {
                type: 'string',
                description: 'Model to use for this sub-agent. Defaults to the parent model if omitted.'
              }
            },
            required: ['agentName', 'message']
          }
        }
      },
      required: ['tasks']
    }
  }
}

interface DelegateTask {
  agentName: string
  message: string
  id?: string
  model?: string
}

interface TaskResult {
  id?: string
  output: string
  usage: AssistantUsage
}

export function createDelegateHandler(
  allHandlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>,
  allTools: ChatCompletionTool[]
): (args: Record<string, unknown>, parentModel: string) => Promise<{ results: TaskResult[] }> {
  const allToolNamesExceptDelegate = allTools
    .map(t => t.function.name)
    .filter(n => n !== 'delegate')

  return async (args, parentModel) => {
    const tasks = args.tasks as DelegateTask[]

    const results = await Promise.all(tasks.map(async (task) => {
      const agentDef = AGENT_REGISTRY[task.agentName]
      if (!agentDef) {
        return {
          ...(task.id !== undefined ? { id: task.id } : {}),
          output: `Error: Unknown agent '${task.agentName}'. Available agents: ${agentNames.join(', ')}`,
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
        }
      }

      const allowList = agentDef.allowTools ?? allToolNamesExceptDelegate

      const { tools, handlers } = resolveToolsByAllowList(
        allTools,
        allHandlers,
        allowList,
        allowList
      )

      const context: LoopContext = {
        messages: [
          { role: 'system', content: agentDef.systemPrompt },
          { role: 'user', content: task.message }
        ]
      }

      const model = task.model ?? parentModel
      let output = ''

      const loopResult = await runAgentLoopCore(
        (chunk) => { if (chunk.type === 'text-delta') output += chunk.text },
        context,
        tools,
        handlers,
        model
      )

      const usage = loopResult.usagePerTurn.reduce<AssistantUsage>(
        (acc, u) => u
          ? { inputTokens: acc.inputTokens + u.inputTokens, outputTokens: acc.outputTokens + u.outputTokens, cachedTokens: acc.cachedTokens + u.cachedTokens }
          : acc,
        { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
      )

      console.log(`[delegate] agent='${task.agentName}'${task.id ? ` id='${task.id}'` : ''} done — in:${usage.inputTokens} out:${usage.outputTokens} cached:${usage.cachedTokens}`)

      return { ...(task.id !== undefined ? { id: task.id } : {}), output, usage }
    }))

    return { results }
  }
}
