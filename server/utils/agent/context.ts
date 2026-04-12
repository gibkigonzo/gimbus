import type {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPartText,
  ChatCompletionContentPartImage
} from 'openai/resources/chat/completions'
import type { LoopContext } from '#shared/types/agent-runtime'
import { blob } from 'hub:blob'
import type { FileAttachment } from '#shared/utils/file'

// ─── DB message → OpenAI param ───────────────────────────────────────────────

type DbMessage = Awaited<ReturnType<typeof import('../db/queries').getChatWithMessages>>['messages'][number]

async function resolveImageParts(files: FileAttachment[]): Promise<ChatCompletionContentPartImage[]> {
  const parts = await Promise.all(
    files.filter(f => f.mediaType.startsWith('image/')).map(async (f) => {
      const blobData = await blob.get(f.pathname)
      if (!blobData) return null
      const ab = await blobData.arrayBuffer()
      const dataUrl = `data:${f.mediaType};base64,${Buffer.from(ab).toString('base64')}`
      return { type: 'image_url' as const, image_url: { url: dataUrl } }
    })
  )
  return parts.filter((p): p is ChatCompletionContentPartImage => p !== null)
}

async function dbMsgToParam(
  m: DbMessage
): Promise<ChatCompletionSystemMessageParam | ChatCompletionUserMessageParam | ChatCompletionAssistantMessageParam | ChatCompletionToolMessageParam> {
  switch (m.role) {
    case 'system':
      return {
        role: 'system',
        content: [{ type: 'text', text: m.content, cache_control: { type: 'ephemeral' } } as ChatCompletionContentPartText]
      }
    case 'tool':
      return { role: 'tool', tool_call_id: m.toolCallId!, content: m.content! }
    case 'assistant':
      return {
        role: 'assistant',
        content: m.content,
        tool_calls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined
      }
    default: {
      const attachments = m.attachments ? JSON.parse(m.attachments) as FileAttachment[] : undefined
      const imageParts = attachments ? await resolveImageParts(attachments) : []
      const content = m.content!
      if (imageParts.length === 0) return { role: 'user', content }
      return { role: 'user', content: [...imageParts, { type: 'text' as const, text: content }] }
    }
  }
}

// ─── buildContext ────────────────────────────────────────────────────────────

/**
 * Builds the LLM context from DB messages.
 * Optionally appends a new user message at the end (for the current turn).
 */
export async function buildContext(
  dbMessages: DbMessage[],
  userMessage?: { content: string; files?: FileAttachment[] }
): Promise<LoopContext> {
  const messages: ChatCompletionMessageParam[] = await Promise.all(
    dbMessages.map(dbMsgToParam)
  )

  if (userMessage) {
    const imageParts = userMessage.files ? await resolveImageParts(userMessage.files) : []
    messages.push({
      role: 'user',
      content: imageParts.length > 0
        ? [...imageParts, { type: 'text' as const, text: userMessage.content }]
        : userMessage.content
    } satisfies ChatCompletionUserMessageParam)
  }

  return { messages }
}
