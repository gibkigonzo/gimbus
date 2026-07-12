import { tool } from 'ai'
import { z } from 'zod'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'

const listSkillsArgsSchema = z.object({})

export const listSkillsTool = tool({
  description: 'List all available skills (name + description, no content) — predefined instruction snippets you can pull into a conversation when a recurring pattern or user preference seems relevant. Follow up with "get_skill" for the one that fits.',
  inputSchema: listSkillsArgsSchema,
  execute: async () => {
    try {
      const rows = await db
        .select({ name: schema.skills.name, description: schema.skills.description })
        .from(schema.skills)
      return toolSuccess({ skills: rows })
    } catch (err: unknown) {
      return toolError((err as Error).message ?? 'Failed to list skills')
    }
  }
})

const getSkillArgsSchema = z.object({
  name: z.string().min(1).describe('The skill name, from list_skills.')
})

export const getSkillTool = tool({
  description: 'Fetch the full content of one skill by name.',
  inputSchema: getSkillArgsSchema,
  execute: async (args) => {
    try {
      const row = await db.query.skills.findFirst({ where: eq(schema.skills.name, args.name) })
      if (!row) return toolError(`No skill found named "${args.name}"`)
      return toolSuccess({ name: row.name, description: row.description, content: row.content, updatedAt: row.updatedAt })
    } catch (err: unknown) {
      return toolError((err as Error).message ?? 'Failed to read skill')
    }
  }
})

const saveSkillArgsSchema = z.object({
  name: z.string().min(1).describe('Unique skill name. Writing an existing name overwrites its description and content.'),
  description: z.string().min(1).describe('One-line summary shown by list_skills, without the full content.'),
  content: z.string().min(1).describe('The instruction snippet itself, injected verbatim when the skill is used.')
})

export const saveSkillTool = tool({
  description: 'Create or update a skill — a predefined instruction snippet other turns (yours or the user\'s) can pull into the conversation. Writing an existing name overwrites it.',
  inputSchema: saveSkillArgsSchema,
  execute: async (args) => {
    try {
      const updatedAt = new Date()
      await db
        .insert(schema.skills)
        .values({ name: args.name, description: args.description, content: args.content, updatedAt })
        .onConflictDoUpdate({
          target: [schema.skills.name],
          set: { description: args.description, content: args.content, updatedAt }
        })
      return toolSuccess({ name: args.name, description: args.description })
    } catch (err: unknown) {
      return toolError((err as Error).message ?? 'Failed to save skill')
    }
  }
})
