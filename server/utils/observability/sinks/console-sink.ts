import type { ObservabilitySink } from '../types'

/** Zero-dependency default sink — proves the tracing pipeline end-to-end without an external account. */
export function createConsoleSink(): ObservabilitySink {
  return {
    onGenerationFinish(event) {
      const tools = event.toolCalls.map(tc => tc.name).join(', ') || 'none'
      console.log(
        `[observability] generation chatId=${event.meta.chatId ?? '-'} agent=${event.meta.agentName ?? '-'} `
        + `model=${event.model.provider}/${event.model.modelId} in=${event.usage.inputTokens} out=${event.usage.outputTokens} `
        + `cached=${event.usage.cachedTokens} finish=${event.finishReason} tools=[${tools}]`
      )
    },
    onToolCall(event) {
      const outcome = event.error ? `error=${String((event.error as Error)?.message ?? event.error)}` : 'ok'
      console.log(
        `[observability] tool_call chatId=${event.meta.chatId ?? '-'} agent=${event.meta.agentName ?? '-'} `
        + `tool=${event.toolName} durationMs=${event.durationMs} ${outcome}`
      )
    }
  }
}
