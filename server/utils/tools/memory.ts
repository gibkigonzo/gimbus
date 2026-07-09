import { tool } from 'ai'
import { z } from 'zod'
import { db, schema } from 'hub:db'
import { and, eq, sql } from 'drizzle-orm'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'

const recallArgsSchema = z.object({
  operation: z.enum(['list_categories', 'list_keys', 'get_value'])
    .describe('"list_categories" — see what categories exist, with counts, no values; "list_keys" — see keys within one category, no values; "get_value" — fetch the value for one category+key.'),
  category: z.string().optional().describe('Required for "list_keys" and "get_value".'),
  key: z.string().optional().describe('Required for "get_value".')
})

export const recallTool = tool({
  description:
    'Look up long-term memory — your persona, mood, opinions, and what you know about the person you\'re talking to. Discover it gradually: start with "list_categories" to see what exists without pulling values, then "list_keys" for a category, then "get_value" for a specific fact. Prefer pulling one piece at a time over dumping everything in a single call.',
  inputSchema: recallArgsSchema,
  execute: async (args) => {
    try {
      if (args.operation === 'list_categories') {
        const rows = await db
          .select({ category: schema.memories.category, count: sql<number>`count(*)` })
          .from(schema.memories)
          .groupBy(schema.memories.category)
        return toolSuccess({ categories: rows })
      }

      if (args.operation === 'list_keys') {
        if (!args.category) return toolError('"category" is required for list_keys')
        const rows = await db
          .select({ key: schema.memories.key })
          .from(schema.memories)
          .where(eq(schema.memories.category, args.category))
        return toolSuccess({ category: args.category, keys: rows.map(r => r.key) })
      }

      if (!args.category || !args.key) return toolError('"category" and "key" are required for get_value')
      const row = await db.query.memories.findFirst({
        where: and(eq(schema.memories.category, args.category), eq(schema.memories.key, args.key))
      })
      if (!row) return toolError(`No memory found for category "${args.category}" key "${args.key}"`)
      return toolSuccess({ category: row.category, key: row.key, value: row.value, updatedAt: row.updatedAt })
    } catch (err: unknown) {
      return toolError((err as Error).message ?? 'Failed to read memory')
    }
  }
})

const rememberArgsSchema = z.object({
  category: z.string().min(1).describe('Grouping label, e.g. "persona", "user". Reuse an existing category from recall when adding a related fact.'),
  key: z.string().min(1).describe('Unique key within the category. Writing an existing category+key overwrites its value.'),
  value: z.string().min(1).describe('The fact to store.')
})

export const rememberTool = tool({
  description: 'Store or update a long-term fact — about your own persona/mood/opinions, or about the person you\'re talking to. Writing an existing category+key overwrites its value.',
  inputSchema: rememberArgsSchema,
  execute: async (args) => {
    try {
      const updatedAt = new Date()
      await db
        .insert(schema.memories)
        .values({ category: args.category, key: args.key, value: args.value, updatedAt })
        .onConflictDoUpdate({
          target: [schema.memories.category, schema.memories.key],
          set: { value: args.value, updatedAt }
        })
      return toolSuccess({ category: args.category, key: args.key, value: args.value })
    } catch (err: unknown) {
      return toolError((err as Error).message ?? 'Failed to write memory')
    }
  }
})
