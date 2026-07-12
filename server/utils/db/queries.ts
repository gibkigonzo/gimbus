import { db, schema } from 'hub:db'
import { asc, eq } from 'drizzle-orm'
import { SYSTEM_PROMPT } from '../prompts'

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

/** Looks up a chat by exact title, creating one if none exists yet — used as the
 * reporting channel for unattended runs (see server/tasks/agent/scheduled-run.ts)
 * so results show up in an ordinary chat with no new UI or DB column needed. */
export async function findOrCreateChat(title: string) {
  const existing = await db.query.chats.findFirst({ where: () => eq(schema.chats.title, title) })
  if (existing) return existing

  const [created] = await db.insert(schema.chats).values({ title }).returning()
  return created!
}

/** Inserts a chat's system row (the static SYSTEM_PROMPT) — shared by every
 * flow that seeds a chat from scratch (POST /api/chats, the scheduled agent
 * task) so the insert shape can't drift between call sites. Returns the
 * inserted row. */
export async function seedSystemMessage(chatId: string) {
  const [row] = await db.insert(schema.messages).values({ chatId, role: 'system', content: SYSTEM_PROMPT }).returning()
  return row!
}
