import type { OnStepFinishEvent, OnToolCallFinishEvent, ToolSet } from 'ai'
import { registerTelemetryIntegration } from 'ai'
import type { AgentGenerationMeta, ObservabilitySink } from './types'

/**
 * The only file that imports ai-sdk's telemetry types. Translates ai-sdk's
 * TelemetryIntegration lifecycle events into our vendor-neutral ObservabilitySink
 * calls and fans them out. Swapping the underlying tracing mechanism (or ai-sdk
 * itself) later only requires rewriting this file — sinks and call sites are untouched.
 */
function readMeta(metadata: Record<string, unknown> | undefined): AgentGenerationMeta {
  return {
    chatId: typeof metadata?.chatId === 'string' ? metadata.chatId : undefined,
    agentName: typeof metadata?.agentName === 'string' ? metadata.agentName : undefined
  }
}

async function fanOut<T>(sinks: ObservabilitySink[], fn: (sink: ObservabilitySink) => T | void | Promise<void>) {
  await Promise.all(sinks.map(async (sink) => {
    try {
      await fn(sink)
    } catch (err) {
      console.error('[observability] sink threw', err)
    }
  }))
}

export function registerAiSdkBridge(sinks: ObservabilitySink[]) {
  registerTelemetryIntegration({
    onStepFinish: async (event: OnStepFinishEvent<ToolSet>) => {
      await fanOut(sinks, sink => sink.onGenerationFinish?.({
        meta: readMeta(event.metadata),
        model: event.model,
        usage: {
          inputTokens: event.usage.inputTokens ?? 0,
          outputTokens: event.usage.outputTokens ?? 0,
          cachedTokens: event.usage.inputTokenDetails?.cacheReadTokens ?? 0
        },
        toolCalls: event.toolCalls.map(tc => ({ name: tc.toolName, input: tc.input })),
        finishReason: event.finishReason
      }))
    },
    onToolCallFinish: async (event: OnToolCallFinishEvent<ToolSet>) => {
      await fanOut(sinks, sink => sink.onToolCall?.({
        meta: readMeta(event.metadata),
        toolName: event.toolCall.toolName,
        input: event.toolCall.input,
        output: event.success ? event.output : undefined,
        error: event.success ? undefined : event.error,
        durationMs: event.durationMs
      }))
    }
  })
}
