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
 * reporting channel for unattended runs (see server/utils/agent/scheduled-task-runner.ts)
 * so results show up in an ordinary chat with no new UI or DB column needed. */
export async function findOrCreateChat(title: string) {
  const existing = await db.query.chats.findFirst({ where: () => eq(schema.chats.title, title) })
  if (existing) return existing

  const [created] = await db.insert(schema.chats).values({ title }).returning()
  return created!
}

/** Inserts a chat's system row — shared by every flow that seeds a chat from
 * scratch (POST /api/chats, scheduled agent tasks) so the insert shape can't
 * drift between call sites. Defaults to the main SYSTEM_PROMPT; scheduled
 * tasks pass their own narrower per-task prompt (see scheduled-task-definitions.ts)
 * so each isolated background task can seed a chat with its own identity.
 * Returns the inserted row. */
export async function seedSystemMessage(chatId: string, content: string = SYSTEM_PROMPT) {
  const [row] = await db.insert(schema.messages).values({ chatId, role: 'system', content }).returning()
  return row!
}

/** Reads the durable consecutive-unopened-run counter for a scheduled task
 * (scheduled-task-review.ts) — 0 if the task has never been tracked yet. */
export async function getScheduledTaskUnopenedCount(key: string): Promise<number> {
  const row = await db.query.scheduledTaskState.findFirst({ where: () => eq(schema.scheduledTaskState.key, key) })
  return row?.consecutiveUnopened ?? 0
}

/** Upserts the durable consecutive-unopened-run counter for a scheduled task. */
export async function setScheduledTaskUnopenedCount(key: string, consecutiveUnopened: number): Promise<void> {
  await db.insert(schema.scheduledTaskState)
    .values({ key, consecutiveUnopened })
    .onConflictDoUpdate({ target: schema.scheduledTaskState.key, set: { consecutiveUnopened, updatedAt: new Date() } })
}
