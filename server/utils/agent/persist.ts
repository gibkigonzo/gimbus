import { db, schema } from 'hub:db'
import type { FileAttachment } from '#shared/utils/file'

/**
 * Persists all messages after the agent loop completes.
 * Saves the user message (if any) followed by the generated assistant+tool messages.
 */
export async function saveTurn(
  chatId: string,
  model: string,
  result: AgentLoopResult,
  userContent?: string,
  files?: FileAttachment[]
): Promise<void> {
  if (userContent) {
    await db.insert(schema.messages).values({
      chatId,
      role: 'user',
      content: userContent,
      model,
      attachments: files && files.length > 0 ? JSON.stringify(files) : null
    })
  }

  let assistantIdx = 0
  for (const msg of result.messages) {
    if (msg.role === 'assistant') {
      const usage = result.usagePerTurn[assistantIdx++] ?? null
      await db.insert(schema.messages).values({
        chatId, role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : null,
        model,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        cachedTokens: usage?.cachedTokens ?? null,
        toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      })
    } else if (msg.role === 'tool') {
      await db.insert(schema.messages).values({
        chatId, role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : null,
        toolCallId: msg.tool_call_id ?? null,
        toolCalledWith: msg.toolCalledWith ?? null,
        model,
      })
    }
  }
}
