import { db, schema } from 'hub:db'
import { asc, eq } from 'drizzle-orm'

export async function sealMessages(chatId: string): Promise<void> {
  await db
    .update(schema.messages)
    .set({ sealed: true })
    .where(eq(schema.messages.chatId, chatId))
}

export async function updateChatMemoryLog(chatId: string, log: string): Promise<void> {
  await db.update(schema.chats).set({ memoryLog: log }).where(eq(schema.chats.id, chatId))
}

export async function getChatWithMessages(id: string) {
  const chat = await db.query.chats.findFirst({
    where: () => eq(schema.chats.id, id),
    with: {
      messages: {
        orderBy: () => asc(schema.messages.createdAt)
      }
    }
  })

  if (!chat) {
    throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
  }

  return chat
}
