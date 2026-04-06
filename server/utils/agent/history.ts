import type {
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionToolMessageParam,
  ChatCompletionContentPartText,
  ChatCompletionContentPartImage
} from 'openai/resources/chat/completions'
import { blob } from 'hub:blob'
import { db, schema } from 'hub:db'
import type { FileAttachment } from '#shared/utils/file'

// ─── XML helpers ────────────────────────────────────────────────────────────

function formatAttachmentsBlock(files: FileAttachment[]): string {
  const lines = files.map((f) => {
    const path = f.playgroundPath ?? f.pathname
    if (f.mediaType.startsWith('image/')) {
      return `  <file type="image" pathname="${path}" />`
    }
    return `  <file type="${f.mediaType === 'application/pdf' ? 'pdf' : 'text'}" pathname="${path}" chunked="${f.isChunked ? 'true' : 'false'}" />`
  })
  return `<attachments>\n${lines.join('\n')}\n</attachments>`
}

/**
 * Builds the XML content to store in DB and send to LLM.
 * Format: [<mode>...</mode>\n][<attachments>...</attachments>\n]<message>\ntext\n</message>
 */
export function formatUserContent(message: string, files?: FileAttachment[], mode?: 'plan' | 'act'): string {
  const modeBlock = mode === 'plan' ? '<mode>planning — think through all steps carefully, do not execute tools yet</mode>\n' : ''
  const attachmentsBlock = files && files.length > 0 ? `${formatAttachmentsBlock(files)}\n` : ''
  return `${modeBlock}${attachmentsBlock}<message>\n${message}\n</message>`
}

/** Strips XML wrapper to recover plain user text for display in UI. */
export function stripUserContentXml(content: string): string {
  return content
    .replace(/^<mode>[\s\S]*?<\/mode>\n?/, '')
    .replace(/^<attachments>[\s\S]*?<\/attachments>\n?/, '')
    .replace(/^<message>\n?/, '')
    .replace(/\n?<\/message>$/, '')
}

async function resolveImageContentParts(files: FileAttachment[]): Promise<ChatCompletionContentPartImage[]> {
  const imageFiles = files.filter(f => f.mediaType.startsWith('image/'))
  const parts = await Promise.all(
    imageFiles.map(async (f) => {
      const blobData = await blob.get(f.pathname)
      if (!blobData) return null
      const arrayBuffer = await blobData.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      const dataUrl = `data:${f.mediaType};base64,${base64}`
      return { type: 'image_url' as const, image_url: { url: dataUrl } }
    })
  )
  return parts.filter((p): p is ChatCompletionContentPartImage => p !== null)
}

// ─── History mapping ─────────────────────────────────────────────────────────

type DbMessage = Awaited<ReturnType<typeof import('../db/queries').getChatWithMessages>>['messages'][number]

export async function dbMessageToOpenAIParam(
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
      const imageParts = attachments ? await resolveImageContentParts(attachments) : []
      const content = m.content!
      if (imageParts.length === 0) return { role: 'user', content }
      return { role: 'user', content: [...imageParts, { type: 'text' as const, text: content }] }
    }
  }
}

export async function buildHistory(
  messages: DbMessage[],
  newMessage?: { content: string; files?: FileAttachment[] },
  memoryLog?: string
): Promise<ChatCompletionMessageParam[]> {
  const history: ChatCompletionMessageParam[] = await Promise.all(
    messages
      .filter(m => m.role === 'system' || !m.sealed)
      .map(dbMessageToOpenAIParam)
  )

  if (memoryLog) {
    const systemIdx = history.findIndex(m => m.role === 'system')
    if (systemIdx !== -1) {
      const sysMsg = history[systemIdx] as ChatCompletionSystemMessageParam
      const existingText = Array.isArray(sysMsg.content)
        ? (sysMsg.content[0] as ChatCompletionContentPartText).text
        : (sysMsg.content ?? '')
      const updatedText = `${existingText}\n<memory>\n${memoryLog}\n</memory>`
      history[systemIdx] = {
        role: 'system',
        content: [{ type: 'text', text: updatedText, cache_control: { type: 'ephemeral' } } as ChatCompletionContentPartText]
      }
    }
  }

  if (newMessage) {
    const imageParts = newMessage.files ? await resolveImageContentParts(newMessage.files) : []
    // newMessage.content is exactly what's stored in DB — no transformation
    history.push({
      role: 'user',
      content: imageParts.length > 0 ? [...imageParts, { type: 'text' as const, text: newMessage.content }] : newMessage.content
    } satisfies ChatCompletionUserMessageParam)
  }

  return history
}

// ─── Persistence ─────────────────────────────────────────────────────────────

interface PersistAgentTurnOptions {
  chatId: string
  model: string
  finalMessages: ChatCompletionMessageParam[]
  historyLength: number
  usagePerTurn: Array<{ inputTokens: number; outputTokens: number; cachedTokens: number } | null>
}

export async function persistAgentTurn({
  chatId,
  model,
  finalMessages,
  historyLength,
  usagePerTurn
}: PersistAgentTurnOptions): Promise<void> {
  const newMessages = finalMessages.slice(historyLength)
  let assistantIdx = 0
  for (const msg of newMessages) {
    if (msg.role === 'assistant') {
      const usage = usagePerTurn[assistantIdx++] ?? null
      await db.insert(schema.messages).values({
        chatId,
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : null,
        model,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        cachedTokens: usage?.cachedTokens ?? null,
        toolCalls: msg.tool_calls ? JSON.stringify(msg.tool_calls) : null,
      })
    } else if (msg.role === 'tool') {
      const extMsg = msg as typeof msg & { toolCalledWith?: string; workflowId?: string }
      await db.insert(schema.messages).values({
        chatId,
        role: 'tool',
        content: typeof msg.content === 'string' ? msg.content : null,
        toolCallId: msg.tool_call_id ?? null,
        toolCalledWith: extMsg.toolCalledWith ?? null,
        workflowId: extMsg.workflowId ?? null,
        model,
      })
    }
  }
}
