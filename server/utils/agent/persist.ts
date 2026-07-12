import { db, schema } from 'hub:db'

/**
 * Persists the generated assistant+tool messages after the agent loop
 * completes. The user message itself is saved separately, immediately when
 * the request comes in (see chats/[id].post.ts) — not gated behind this.
 *
 * `sealed` marks whether these rows represent a normally-finished turn
 * (true) or the leftover, fully-completed-steps-only remainder of a turn
 * cut short by an abort (false, see AgentLoopResult.aborted). It's the
 * caller's job to pass `!result.aborted` — kept explicit here rather than
 * defaulted so every call site has to consciously decide.
 */
export async function saveTurn(
  chatId: string,
  model: string,
  result: AgentLoopResult,
  { sealed }: { sealed: boolean }
): Promise<void> {
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
        sealed
      })
    } else if (msg.role === 'tool') {
      await db.insert(schema.messages).values({
        chatId, role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : null,
        toolCallId: msg.tool_call_id ?? null,
        toolCalledWith: msg.toolCalledWith ?? null,
        model,
        sealed
      })
    }
  }
}
