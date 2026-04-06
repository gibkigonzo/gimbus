import { db, schema } from 'hub:db'
import { desc } from 'drizzle-orm'

export default defineEventHandler(async () => {
  return db.select().from(schema.files).orderBy(desc(schema.files.createdAt))
})
