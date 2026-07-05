import { db, schema } from 'hub:db'
import { asc, eq } from 'drizzle-orm'

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

export async function updateChatTitle(id: string, title: string) {
  await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, id))
}
