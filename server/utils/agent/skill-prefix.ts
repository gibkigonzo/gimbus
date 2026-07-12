import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'

const SKILL_PATTERN = /^\/(\S+)\s*([\s\S]*)$/

/**
 * Resolves a "/name rest" prefix into "<skill name="name">content</skill>\n\nrest".
 * Shared by chats.post.ts (a chat's very first message) and chats/[id].post.ts
 * (every later message) so a skill-prefixed message behaves identically
 * regardless of whether it's turn 1 or turn 20 — resolved once, before the
 * message is ever saved, so DB content and what's sent to the LLM never
 * diverge (CLAUDE.md's DB=LLM invariant). No match, or no skill by that name,
 * returns the message unchanged.
 */
export async function resolveSkillPrefix(message: string, hasFiles: boolean): Promise<string> {
  if (hasFiles) return message
  const match = message.match(SKILL_PATTERN)
  if (!match) return message

  const skill = await db.query.skills.findFirst({ where: eq(schema.skills.name, match[1]!) })
  if (!skill) return message

  return `<skill name="${skill.name}">\n${skill.content}\n</skill>\n\n${match[2]}`
}
