import { z } from 'zod'
import type { AgentMessage } from '#shared/types/agent'
import type { ChatCompletionMessageToolCall } from 'openai/resources/index.mjs'
import { getChatWithMessages } from '../../utils/db/queries'
import { stripUserContentXml } from '../../utils/agent/history'

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const chat = await getChatWithMessages(id)

  // Convert DB rows (OpenAI format) to AgentMessage for the frontend
  const messages: AgentMessage[] = chat.messages
    .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
    .reduce<AgentMessage[]>((acc, m) => {
      const baseMessage = {
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'tool',
        content: m.role === 'user' ? stripUserContentXml(m.content ?? '') : (m.content ?? ''),
        model: m.model,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        cachedTokens: m.cachedTokens
      }

      if (m.role === 'tool') {
        const { id } = acc[acc.length - 1] as AgentMessage
        const previousMessage = chat.messages.find(msg => msg.id === id)
        const toolCalls = JSON.parse(previousMessage?.toolCalls ?? '[]') as ChatCompletionMessageToolCall[]
        const toolName = toolCalls.find(tc => tc.id === m.toolCallId)?.function?.name

        return [
          ...acc,
          {
            ...baseMessage,
            parts: [{
              type: 'tool-result' as const,
              toolName: toolName ?? '',
              result: m.content,
              toolCalledWith: m.toolCalledWith ?? null
            }]
          }
        ]
      }

      // For assistant and user messages, parts array contains a single text part
      return [
        ...acc,
        {
          ...baseMessage,
          parts: [{
            type: 'text' as const,
            text: baseMessage.content
          }]
        }
      ]
    }, [])
    .filter(m => m.content) // Filter out messages with null content (e.g. assistant tool calls without content)

  return { ...chat, messages }
})
