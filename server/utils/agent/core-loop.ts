import { streamText, stepCountIs } from 'ai'
import type { ToolSet, TextStreamPart } from 'ai'
import type { LoopMessage, LoopContext } from '#shared/types/agent-runtime'
import type { AgentGenerationMeta } from '../observability/types'
import { getModel } from './model-provider'

const MAX_ITERATIONS = 60
// Per-step cap, not per-model config: prevents a model's own (much larger) default
// ceiling from being requested outright, which OpenRouter rejects outright when the
// account's available credit balance is below that ceiling.
export const MAX_OUTPUT_TOKENS = 8192

/**
 * Maps a single ai-sdk fullStream part to the wire SseChunk shape the frontend/DB
 * layer already understand — returns null for parts that don't produce a chunk.
 */
export function mapStreamPartToSse(part: TextStreamPart<ToolSet>, model: string): SseChunk | null {
  switch (part.type) {
    case 'text-delta':
      return { type: 'text-delta', text: part.text }
    case 'tool-result':
      return { type: 'tool-result', toolName: part.toolName, result: part.output, model, toolCalledWith: JSON.stringify(part.input) }
    case 'tool-error':
      // Defensive fallback — tools are expected to self-catch and resolve with {error}, not throw.
      return { type: 'tool-result', toolName: part.toolName, result: { error: String((part.error as Error)?.message ?? part.error) }, model, toolCalledWith: JSON.stringify(part.input) }
    case 'finish-step':
      return {
        type: 'usage',
        inputTokens: part.usage.inputTokens ?? 0,
        outputTokens: part.usage.outputTokens ?? 0,
        cachedTokens: part.usage.inputTokenDetails?.cacheReadTokens ?? 0,
        model
      }
    case 'error':
      return { type: 'error', message: String((part.error as Error)?.message ?? part.error) }
    default:
      return null
  }
}

export async function runAgentLoopCore(
  pushSse: (chunk: SseChunk) => Promise<void> | void,
  context: LoopContext,
  tools: ToolSet,
  activeToolNames: string[],
  model: string,
  signal?: AbortSignal,
  meta?: AgentGenerationMeta
): Promise<AgentLoopResult> {
  const generatedMessages: LoopMessage[] = []
  const usagePerTurn: (AssistantUsage | null)[] = []

  try {
    const result = streamText({
      model: getModel(model),
      system: context.system,
      messages: context.messages,
      tools,
      activeTools: activeToolNames,
      stopWhen: stepCountIs(MAX_ITERATIONS),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: signal,
      experimental_context: { model, chatId: meta?.chatId },
      experimental_telemetry: { isEnabled: true, metadata: { ...meta } },
      onError: () => {} // suppress default console.error — 'error' parts are handled explicitly below
    })

    for await (const part of result.fullStream) {
      const chunk = mapStreamPartToSse(part, model)
      if (chunk) {
        if (chunk.type === 'error') console.error('[agent] Stream error', chunk.message)
        await pushSse(chunk)
      }
    }

    const steps = await result.steps
    for (const step of steps) {
      generatedMessages.push({
        role: 'assistant',
        content: step.text || null,
        tool_calls: step.toolCalls.length > 0
          ? step.toolCalls.map(tc => ({ id: tc.toolCallId, type: 'function' as const, function: { name: tc.toolName, arguments: JSON.stringify(tc.input) } }))
          : undefined
      })
      usagePerTurn.push({
        inputTokens: step.usage.inputTokens ?? 0,
        outputTokens: step.usage.outputTokens ?? 0,
        cachedTokens: step.usage.inputTokenDetails?.cacheReadTokens ?? 0
      })
      for (const tr of step.toolResults) {
        generatedMessages.push({
          role: 'tool',
          content: JSON.stringify(tr.output),
          tool_call_id: tr.toolCallId,
          toolCalledWith: JSON.stringify(tr.input)
        })
      }
    }
  } catch (err: unknown) {
    console.error('[agent] Error during streaming completion', err)
    await pushSse({ type: 'error', message: (err as Error).message })
  }

  await pushSse({ type: 'done' })
  return { messages: generatedMessages, usagePerTurn }
}
