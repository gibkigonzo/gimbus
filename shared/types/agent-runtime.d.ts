import type { H3Event } from 'h3'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

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
}

export interface SseDone {
  type: 'done'
}

export interface SseError {
  type: 'error'
  message: string
}

export type SseChunk = SseTextDelta | SseToolResult | SseUsage | SseDone | SseError

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
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  // tool fields
  tool_call_id?: string
  // metadata carried through the loop, not sent to the API
  toolCalledWith?: string
  workflowId?: string
}

export interface AgentLoopResult {
  messages: LoopMessage[]
  usagePerTurn: (AssistantUsage | null)[]
}

/** Pre-built LLM context produced by buildContext(). */
export interface LoopContext {
  /** Full message list ready to send to the LLM. */
  messages: ChatCompletionMessageParam[]
}

export interface StreamingAgentLoopOptions {
  event: H3Event
  context: LoopContext
  model: string
  allowTools?: string[]
  onCompleted?: (result: AgentLoopResult) => void | Promise<void>
}

export interface StreamingAgentLoopHandle {
  send: Promise<void>
  completed: Promise<AgentLoopResult>
}