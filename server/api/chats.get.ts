import { db, schema } from 'hub:db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  return await db.query.chats.findMany({
    orderBy: () => desc(schema.chats.createdAt)
  })
})
