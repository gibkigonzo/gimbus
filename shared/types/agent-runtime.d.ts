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

export interface StreamingAgentLoopOptions {
  event: H3Event
  initialMessages: ChatCompletionMessageParam[]
  model: string
  allowTools?: string[]
  historyLimit?: number
  maxIterations?: number
  onCompleted?: (result: StreamingAgentLoopCompleted) => void
}

export interface StreamingAgentLoopCompleted {
  finalMessages: ChatCompletionMessageParam[]
  usagePerTurn: (AssistantUsage | null)[]
}

export interface StreamingAgentLoopHandle {
  send: Promise<void>
  completed: Promise<StreamingAgentLoopCompleted>
}

export interface StreamingAgentRunner {
  start: () => Promise<void>
  completed: Promise<StreamingAgentLoopCompleted>
}