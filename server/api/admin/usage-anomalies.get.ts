import { z } from 'zod'
import { sql, gte } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * Note: `scripts/*.ts` can't reach the DB directly — `hub:db` (like `hub:blob`) is a NuxtHub
 * virtual module only resolvable inside the running Nitro process, so this lives as an API
 * route rather than a standalone script. Query it with curl/cron the same way as any other
 * endpoint; `hasAnomalies` is a stable boolean for scripted alerting.
 */

const querySchema = z.object({
  hours: z.coerce.number().positive().default(24),
  tokenThreshold: z.coerce.number().positive().default(200_000),
  stepThreshold: z.coerce.number().positive().default(40)
})

defineRouteMeta({
  openAPI: {
    description: 'Flag chats with anomalous token usage or assistant step counts over a recent time window.',
    tags: ['admin']
  }
})

export default defineEventHandler(async (event) => {
  const { hours, tokenThreshold, stepThreshold } = await getValidatedQuery(event, querySchema.parse)
  const since = new Date(Date.now() - hours * 60 * 60 * 1000)

  const rows = await db
    .select({
      chatId: schema.messages.chatId,
      totalTokens: sql<number>`coalesce(sum(${schema.messages.inputTokens} + ${schema.messages.outputTokens} + ${schema.messages.cachedTokens}), 0)`,
      assistantSteps: sql<number>`sum(case when ${schema.messages.role} = 'assistant' then 1 else 0 end)`
    })
    .from(schema.messages)
    .where(gte(schema.messages.createdAt, since))
    .groupBy(schema.messages.chatId)

  const anomalies = rows.filter(r => r.totalTokens > tokenThreshold || r.assistantSteps > stepThreshold)

  return {
    windowHours: hours,
    thresholds: { tokenThreshold, stepThreshold },
    checkedChats: rows.length,
    hasAnomalies: anomalies.length > 0,
    anomalies
  }
})
