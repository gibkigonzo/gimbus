import type {
  ModelMessage,
  SystemModelMessage,
  UserModelMessage,
  AssistantModelMessage,
  ToolModelMessage,
  ImagePart
} from 'ai'
import type { LoopContext } from '#shared/types/agent-runtime'
import { blob } from 'hub:blob'
import type { FileAttachment } from '#shared/utils/file'

// ─── DB message → ai-sdk ModelMessage ────────────────────────────────────────

type DbMessage = Awaited<ReturnType<typeof import('../db/queries').getChatWithMessages>>['messages'][number]

async function resolveImageParts(files: FileAttachment[]): Promise<ImagePart[]> {
  const parts = await Promise.all(
    files.filter(f => f.mediaType.startsWith('image/')).map(async (f): Promise<ImagePart | null> => {
      const blobData = await blob.get(f.pathname)
      if (!blobData) return null
      const ab = await blobData.arrayBuffer()
      const dataUrl = `data:${f.mediaType};base64,${Buffer.from(ab).toString('base64')}`
      return { type: 'image', image: dataUrl }
    })
  )
  return parts.filter((p): p is ImagePart => p !== null)
}

/** Finds the toolName for a tool-result row by scanning back to the preceding assistant tool_call with a matching id. */
function findToolName(dbMessages: DbMessage[], index: number, toolCallId: string): string {
  for (let i = index - 1; i >= 0; i--) {
    const m = dbMessages[i]!
    if (m.role !== 'assistant' || !m.toolCalls) continue
    const toolCalls = JSON.parse(m.toolCalls) as { id: string, function: { name: string } }[]
    const match = toolCalls.find(tc => tc.id === toolCallId)
    if (match) return match.function.name
  }
  return 'unknown'
}

async function dbMsgToParam(
  m: DbMessage,
  index: number,
  dbMessages: DbMessage[]
): Promise<UserModelMessage | AssistantModelMessage | ToolModelMessage> {
  switch (m.role) {
    case 'tool':
      return {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: m.toolCallId!,
          toolName: findToolName(dbMessages, index, m.toolCallId!),
          output: { type: 'json', value: JSON.parse(m.content!) }
        }]
      }
    case 'assistant': {
      const toolCalls = m.toolCalls ? JSON.parse(m.toolCalls) as { id: string, function: { name: string, arguments: string } }[] : undefined
      // A row from an @mention-routed sub-agent turn (agentSource set, see
      // persist.ts/chats/[id].post.ts) never saw this conversation and spoke
      // under a different system prompt — replaying its text to a later
      // ordinary turn without saying so would let the main agent mistake a
      // specialist's answer for its own prior reasoning.
      const content = m.agentSource && m.content
        ? `[Delegated reply from sub-agent "${m.agentSource}" — it did not see this conversation; this is a specialist's answer, not something you said]\n${m.content}`
        : m.content
      if (!toolCalls) {
        return { role: 'assistant', content: content ?? '' }
      }
      return {
        role: 'assistant',
        content: [
          ...(content ? [{ type: 'text' as const, text: content }] : []),
          ...toolCalls.map(tc => ({
            type: 'tool-call' as const,
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: JSON.parse(tc.function.arguments)
          }))
        ]
      }
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
  userMessage?: { content: string, files?: FileAttachment[] }
): Promise<LoopContext> {
  const systemRow = dbMessages.find(m => m.role === 'system')
  const conversationRows = dbMessages.filter(m => m.role !== 'system')

  const system: SystemModelMessage | undefined = systemRow
    ? {
        role: 'system',
        content: systemRow.content!,
        providerOptions: { openrouter: { cacheControl: { type: 'ephemeral' } } }
      }
    : undefined

  const messages: ModelMessage[] = await Promise.all(
    conversationRows.map((m, index) => dbMsgToParam(m, index, conversationRows))
  )

  if (userMessage) {
    const imageParts = userMessage.files ? await resolveImageParts(userMessage.files) : []
    messages.push({
      role: 'user',
      content: imageParts.length > 0
        ? [...imageParts, { type: 'text' as const, text: userMessage.content }]
        : userMessage.content
    } satisfies UserModelMessage)
  }

  return { system, messages }
}
