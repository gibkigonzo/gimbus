import { streamText, stepCountIs } from 'ai'
import type { ToolSet, TextStreamPart, ModelMessage } from 'ai'
import type { LoopMessage, LoopContext } from '#shared/types/agent-runtime'
import type { AgentGenerationMeta } from '../observability/types'
import { getModel } from './model-provider'
import { waitForConfirmation, resolveConfirmation } from '../tool-runtime/confirmation-registry'

const MAX_ITERATIONS = 60
// Per-step cap, not per-model config: prevents a model's own (much larger) default
// ceiling from being requested outright, which OpenRouter rejects outright when the
// account's available credit balance is below that ceiling. Raised from 8192 after
// two independent models (Claude Sonnet 4.6, then Deepseek v4-pro) both hit
// finishReason: 'length' at exactly the old cap on the same reasoning-heavy
// multi-constraint route-planning task — 8192 was empirically too low for a single
// step that reasons over a 10x10 grid under two competing resource constraints.
export const MAX_OUTPUT_TOKENS = 24576

/**
 * Moves the (non-system) cache breakpoint to the last message of the current step.
 *
 * `stopWhen: stepCountIs(MAX_ITERATIONS)` drives many internal streamText steps
 * (tool call -> tool result -> next step) inside a single agent turn, each appending
 * fresh messages and re-sending the whole prompt. A breakpoint set once up front never
 * moves, so every step past the first pays full price for the growing tail. Re-marking
 * the last message on every step, via `prepareStep`, keeps the whole prior prefix cached
 * and only charges for the delta generated since the previous step.
 *
 * Moving the breakpoint means exactly that — any earlier message still carrying a
 * marker from a previous step's call must have it stripped, otherwise markers pile
 * up one per step instead of relocating, and requests eventually exceed the
 * provider's max cache-block count (Anthropic/Azure: 4 total, including the
 * system prompt's own separate breakpoint from context.ts).
 */
export function markLastMessageCacheable(messages: ModelMessage[]): ModelMessage[] {
  if (messages.length === 0) return messages
  const lastIndex = messages.length - 1
  return messages.map((message, index) => {
    if (index === lastIndex) {
      return {
        ...message,
        providerOptions: {
          ...message.providerOptions,
          openrouter: { cacheControl: { type: 'ephemeral' } }
        }
      }
    }

    if (!message.providerOptions?.openrouter) return message
    const { openrouter: _openrouter, ...providerOptions } = message.providerOptions
    if (Object.keys(providerOptions).length > 0) return { ...message, providerOptions }
    const { providerOptions: _providerOptions, ...rest } = message
    return rest as ModelMessage
  })
}

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
        model,
        truncated: part.finishReason === 'length'
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
      prepareStep: ({ messages }) => ({ messages: markLastMessageCacheable(messages) }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: signal,
      experimental_context: {
        model,
        chatId: meta?.chatId,
        requestConfirmation: async (toolName: string, input: unknown) => {
          const confirmationId = crypto.randomUUID()
          await pushSse({ type: 'confirmation-request', confirmationId, toolName, input })
          // If the client disconnects while we're waiting, resolveConfirmation
          // both unblocks the tool call and cleans up the pending entry — the
          // same path a real user response takes.
          const onAbort = () => resolveConfirmation(confirmationId, false)
          signal?.addEventListener('abort', onAbort, { once: true })
          try {
            return await waitForConfirmation(confirmationId)
          } finally {
            signal?.removeEventListener('abort', onAbort)
          }
        }
      },
      experimental_telemetry: { isEnabled: true, metadata: { ...meta } },
      onError: () => {} // suppress default console.error — 'error' parts are handled explicitly below
    })

    for await (const part of result.fullStream) {
      const chunk = mapStreamPartToSse(part, model)
      if (chunk) {
        if (chunk.type === 'error') console.error('[agent] Stream error', chunk.message)
        if (chunk.type === 'usage' && chunk.truncated) {
          // A truncated step with no completed tool call looks identical to "the
          // model is done" to ai-sdk's step-continuation logic — the agent loop
          // silently ends the turn here instead of erroring, so this is the only
          // place the cutoff is visible without inspecting raw usage numbers.
          console.warn(`[agent] Step hit maxOutputTokens (${MAX_OUTPUT_TOKENS}) and was cut off (finishReason: length) — the turn may have ended without completing its response or tool call`)
        }
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
  // Whatever's in generatedMessages at this point is already safe to persist
  // even when aborted mid-turn: it's built from result.steps, which ai-sdk
  // only ever populates with fully-finished steps (a tool call is never
  // recorded without its paired result) — an abort just means fewer steps
  // made it in, not a malformed one.
  return { messages: generatedMessages, usagePerTurn, aborted: signal?.aborted ?? false }
}
