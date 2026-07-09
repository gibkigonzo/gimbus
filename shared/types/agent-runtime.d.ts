import type { H3Event } from 'h3'
import type { ModelMessage, SystemModelMessage } from 'ai'

export interface SseTextDelta {
  type: 'text-delta'
  text: string
}

export interface SseToolResult {
  type: 'tool-result'
  toolName: string
  result: unknown
  model: string
  toolCalledWith?: string
}

export interface SseUsage {
  type: 'usage'
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  model: string
  /** True when this step's finishReason was 'length' — the model was cut off by maxOutputTokens before finishing its text/tool call. */
  truncated: boolean
}

export interface SseDone {
  type: 'done'
}

export interface SseError {
  type: 'error'
  message: string
}

export interface SseTitle {
  type: 'title'
  title: string
}

export interface SseConfirmationRequest {
  type: 'confirmation-request'
  confirmationId: string
  toolName: string
  input: unknown
}

export type SseChunk = SseTextDelta | SseToolResult | SseUsage | SseDone | SseError | SseTitle | SseConfirmationRequest

export interface AssistantUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
}

/** Internal message type for the agent loop — flat interface, not extending the OpenAI union. */
export interface LoopMessage {
  role: 'assistant' | 'tool'
  content: string | null
  // assistant fields
  tool_calls?: { id: string, type: 'function', function: { name: string, arguments: string } }[]
  // tool fields
  tool_call_id?: string
  // metadata carried through the loop, not sent to the API
  toolCalledWith?: string
}

export interface AgentLoopResult {
  messages: LoopMessage[]
  usagePerTurn: (AssistantUsage | null)[]
}

/** Pre-built LLM context produced by buildContext(). */
export interface LoopContext {
  /** Sent via streamText's dedicated `system` option rather than embedded in `messages` — ai-sdk flags in-message system roles as a prompt-injection risk. */
  system?: SystemModelMessage
  /** Full message list ready to send to the LLM (excludes the system message). */
  messages: ModelMessage[]
}

export interface StreamingAgentLoopOptions {
  event: H3Event
  context: LoopContext
  model: string
  chatId: string
  allowTools?: string[]
  onCompleted?: (result: AgentLoopResult, pushSse: (chunk: SseChunk) => void | Promise<void>) => void | Promise<void>
}

export interface StreamingAgentLoopHandle {
  send: Promise<void>
  completed: Promise<AgentLoopResult>
}
