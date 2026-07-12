import { z } from 'zod'
import { structuredChat } from '../openrouter'
import { stripUserContentXml } from './history'
import { updateChatTitle } from '../db/queries'

const titleSchema = z.object({ title: z.string().max(60) }).describe('ChatTitle')

/**
 * Runs only on a chat's very first turn (isFirstTurn) — subsequent turns keep
 * whatever title this generated. Never throws: a failure here must not affect
 * the turn that already streamed successfully to the client.
 */
export async function maybeGenerateChatTitle(
  chatId: string,
  model: string,
  isFirstTurn: boolean,
  userContent: string | undefined,
  result: AgentLoopResult,
  pushSse: (chunk: SseChunk) => void | Promise<void>
): Promise<void> {
  // result.aborted: don't spend a real LLM call generating a title off a
  // turn that got cut short (e.g. a closed tab a second after the first
  // message) — sealed:false rows from persist.ts's partial-save aren't
  // reliable "finished" content to summarize.
  if (!isFirstTurn || !userContent || result.aborted) return

  try {
    const assistantText = result.messages.find(m => m.role === 'assistant')?.content ?? ''
    const { title } = await structuredChat(
      [{
        role: 'user',
        content: `Generate a short, descriptive title (max 6 words) for this conversation, in the same language as the conversation. Return only the title.\n\nUser: ${stripUserContentXml(userContent)}\n\nAssistant: ${assistantText}`
      }],
      titleSchema,
      model,
      'ChatTitle',
      { chatId, agentName: 'title' }
    )
    await updateChatTitle(chatId, title)
    await pushSse({ type: 'title', title })
  } catch (err) {
    console.error('[agent] Title generation failed', err)
  }
}
