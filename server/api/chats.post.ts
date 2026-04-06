import { db, schema } from 'hub:db'
import { z } from 'zod'
import { formatUserContent } from '../utils/agent/history'

const fileAttachmentSchema = z.object({
  type: z.literal('file'),
  mediaType: z.string(),
  pathname: z.string(),
  fileId: z.string().optional(),
  playgroundPath: z.string().optional(),
  isChunked: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  const { id, message, model, files } = await readValidatedBody(event, z.object({
    id: z.string(),
    message: z.string().min(1),
    model: z.string(),
    files: z.array(fileAttachmentSchema).optional()
  }).parse)

  const title = new Date().toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const [chat] = await db.insert(schema.chats).values({ id, title }).returning()

  if (!chat) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create chat' })
  }

  await db.insert(schema.messages).values({
    chatId: chat.id,
    role: 'system',
    content: SYSTEM_PROMPT
  })

  await db.insert(schema.messages).values({
    chatId: chat.id,
    role: 'user',
    content: formatUserContent(message, files),
    model,
    attachments: files && files.length > 0 ? JSON.stringify(files) : null
  })

  return chat
})
