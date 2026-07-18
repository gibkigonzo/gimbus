import { z } from 'zod'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'

// Deliberately a separate, explicit action rather than a side effect of
// GET /api/chats/[id] — that GET is also hit by app/layouts/default.vue's
// onNuxtReady sidebar prefetch (a background warm-up for the 10 most recent
// chats, not a real visit), which would otherwise clear the sidebar's
// "needs attention" badge (server/utils/agent/scheduled-task-runner.ts) before the
// user ever consciously opened the chat. Only app/pages/chat/[id].vue calls
// this, once, after its own page-level fetch resolves.
defineRouteMeta({
  openAPI: {
    description: 'Mark a chat as seen, clearing its sidebar "needs attention" flag.',
    tags: ['ai']
  }
})
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  await db.update(schema.chats).set({ needsAttention: false }).where(eq(schema.chats.id, id))

  return { ok: true }
})
