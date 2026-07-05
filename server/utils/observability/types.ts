/** Ambient identifiers threaded through experimental_telemetry.metadata on every generateText/streamText call. */
export interface AgentGenerationMeta {
  chatId?: string
  /** 'main' | 'delegate:<agentName>' | 'tool:<toolName>' | 'eval' | ... */
  agentName?: string
}

export interface GenerationFinishEvent {
  meta: AgentGenerationMeta
  model: { provider: string, modelId: string }
  usage: { inputTokens: number, outputTokens: number, cachedTokens: number }
  toolCalls: { name: string, input: unknown }[]
  finishReason: string
}

export interface ToolCallEvent {
  meta: AgentGenerationMeta
  toolName: string
  input: unknown
  output?: unknown
  error?: unknown
  durationMs: number
}

/**
 * Vendor-neutral tracing destination. Implement this to add a new backend
 * (Langfuse, Braintrust, ...) without touching any agent-loop call site —
 * only ai-sdk-bridge.ts and index.ts need to know a new sink exists.
 */
export interface ObservabilitySink {
  onGenerationFinish?(event: GenerationFinishEvent): void | Promise<void>
  onToolCall?(event: ToolCallEvent): void | Promise<void>
}
