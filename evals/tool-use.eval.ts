import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { buildToolRuntimeState } from '#server/utils/tool-runtime/build'
import { resolveActiveToolNames } from '#server/utils/agent/tool-selection'
import { runAgentLoopCore } from '#server/utils/agent/core-loop'
import { SYSTEM_PROMPT } from '#server/utils/prompts'
import type { ToolRuntimeState } from '#shared/types/tool-runtime'
import type { LoopContext } from '#shared/types/agent-runtime'
import scenarios from './tool-use.synthetic.json'

/**
 * Real, paid, non-deterministic eval against the live model via OpenRouter —
 * deliberately excluded from `pnpm test` (see vitest.evals.config.ts). Run
 * with `pnpm evals:tools`. Checks tool *selection* only (deterministic string
 * match on the called tool name), never the tool's output — cheapest possible
 * signal per the lesson's cost-consciousness point.
 */

interface Scenario {
  id: string
  userMessage: string
  expectedTool: string | null
}

const EVAL_MODEL = process.env.EVAL_MODEL ?? 'openai/gpt-4o-mini'

let runtime: ToolRuntimeState

beforeAll(async () => {
  runtime = await buildToolRuntimeState()
}, 30_000)

afterAll(async () => {
  await runtime.close()
})

describe('tool-use eval', () => {
  for (const scenario of scenarios as Scenario[]) {
    it(scenario.id, async () => {
      const activeToolNames = resolveActiveToolNames(runtime.defaultEnabledToolNames)
      const context: LoopContext = {
        system: { role: 'system', content: SYSTEM_PROMPT },
        messages: [{ role: 'user', content: scenario.userMessage }]
      }

      const result = await runAgentLoopCore(
        () => {},
        context,
        runtime.tools,
        activeToolNames,
        EVAL_MODEL,
        undefined,
        { agentName: 'eval' }
      )

      const calledTools = result.messages
        .filter(m => m.role === 'assistant' && m.tool_calls)
        .flatMap(m => m.tool_calls!.map(tc => tc.function.name))

      if (scenario.expectedTool === null) {
        expect(calledTools).toHaveLength(0)
      } else {
        expect(calledTools).toContain(scenario.expectedTool)
      }
    }, 30_000)
  }
})
