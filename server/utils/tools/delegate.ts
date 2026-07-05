import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod'
import type { LoopContext } from '#shared/types/agent-runtime'
import type { ToolExecContext } from '#shared/types/tool-runtime'
import { runAgentLoopCore } from '../agent/core-loop'
import { AGENT_REGISTRY } from './delegate-agents'

const agentNames = Object.keys(AGENT_REGISTRY)
const agentDescriptionList = agentNames
  .map(name => `${name} — ${AGENT_REGISTRY[name]!.description}`)
  .join('; ')

const argsSchema = z.object({
  tasks: z.array(z.object({
    agentName: z.enum(agentNames as [string, ...string[]])
      .describe(`Name of the agent to spawn. Available: ${agentDescriptionList}`),
    message: z.string().describe('The task instruction passed as the user message to the sub-agent.'),
    id: z.string().optional().describe('Optional correlation ID returned alongside the result.'),
    model: z.string().optional().describe('Model to use for this sub-agent. Defaults to the parent model if omitted.')
  })).describe('List of sub-agent tasks to run in parallel.')
})

interface TaskResult {
  id?: string
  output: string
  usage: AssistantUsage
}

/**
 * Registered last in tool-runtime/build.ts — its execute() closes over the complete
 * merged tool set, so every other tool (built-in + MCP) must already be registered
 * by the time this factory is called.
 */
export function createDelegateHandler(allTools: ToolSet, allToolNames: string[]) {
  const allToolNamesExceptDelegate = allToolNames.filter(n => n !== 'delegate')

  return tool({
    description: `Spawn one or more sub-agents in parallel and return their outputs. Each agent has a fixed system prompt and tool set defined by the developer. Available agents: ${agentDescriptionList}`,
    inputSchema: argsSchema,
    execute: async (args, { experimental_context }) => {
      const parentModel = (experimental_context as ToolExecContext).model

      const results: TaskResult[] = await Promise.all(args.tasks.map(async (task) => {
        const agentDef = AGENT_REGISTRY[task.agentName]
        if (!agentDef) {
          return {
            ...(task.id !== undefined ? { id: task.id } : {}),
            output: `Error: Unknown agent '${task.agentName}'. Available agents: ${agentNames.join(', ')}`,
            usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }
          }
        }

        const activeToolNames = agentDef.allowTools ?? allToolNamesExceptDelegate

        const context: LoopContext = {
          system: { role: 'system', content: agentDef.systemPrompt },
          messages: [{ role: 'user', content: task.message }]
        }

        const model = task.model ?? parentModel
        let output = ''

        const loopResult = await runAgentLoopCore(
          (chunk) => { if (chunk.type === 'text-delta') output += chunk.text },
          context,
          allTools,
          activeToolNames,
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
  })
}
