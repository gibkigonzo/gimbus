import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../db/schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })

await client.execute(`
  CREATE TABLE skills (
    id text PRIMARY KEY NOT NULL,
    name text NOT NULL,
    description text NOT NULL,
    content text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`)
await client.execute('CREATE UNIQUE INDEX skills_name_idx ON skills (name)')

vi.mock('hub:db', () => ({ db, schema }))

const { listSkillsTool, getSkillTool, saveSkillTool } = await import('./skills')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function listSkills() {
  return listSkillsTool.execute!({}, toolOptions)
}

function getSkill(args: { name: string }) {
  return getSkillTool.execute!(args, toolOptions)
}

function saveSkill(args: { name: string, description: string, content: string }) {
  return saveSkillTool.execute!(args, toolOptions)
}

describe('skills', () => {
  beforeEach(async () => {
    await client.execute('DELETE FROM skills')
  })

  it('save_skill inserts a new skill', async () => {
    const result = await saveSkill({ name: 'changelog-style', description: 'Preferred changelog tone', content: 'Write terse, imperative-mood bullet points.' }) as { name: string, description: string }
    expect(result).toEqual({ name: 'changelog-style', description: 'Preferred changelog tone' })
  })

  it('save_skill overwrites an existing name rather than duplicating it', async () => {
    await saveSkill({ name: 'changelog-style', description: 'v1', content: 'old content' })
    await saveSkill({ name: 'changelog-style', description: 'v2', content: 'new content' })

    const result = await getSkill({ name: 'changelog-style' }) as { description: string, content: string }
    expect(result.description).toBe('v2')
    expect(result.content).toBe('new content')

    const all = await listSkills() as { skills: { name: string, description: string }[] }
    expect(all.skills).toEqual([{ name: 'changelog-style', description: 'v2' }])
  })

  it('list_skills returns name + description without content', async () => {
    await saveSkill({ name: 'a', description: 'desc-a', content: 'secret-a' })
    await saveSkill({ name: 'b', description: 'desc-b', content: 'secret-b' })

    const result = await listSkills() as { skills: { name: string, description: string }[] }
    expect(result.skills.sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      { name: 'a', description: 'desc-a' },
      { name: 'b', description: 'desc-b' }
    ])
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('get_skill returns an error when the skill does not exist', async () => {
    const result = await getSkill({ name: 'missing' }) as { error: string }
    expect(result.error).toMatch(/No skill found/)
  })

  it('get_skill returns full content for an existing skill', async () => {
    await saveSkill({ name: 'a', description: 'desc-a', content: 'full content here' })
    const result = await getSkill({ name: 'a' }) as { name: string, content: string }
    expect(result).toMatchObject({ name: 'a', content: 'full content here' })
  })

  it('handles concurrent save_skill calls to the same name without throwing', async () => {
    const results = await Promise.all([
      saveSkill({ name: 'race', description: 'a', content: 'a' }),
      saveSkill({ name: 'race', description: 'b', content: 'b' })
    ])
    expect(results.every(r => 'name' in r)).toBe(true)
    const all = await listSkills() as { skills: { name: string }[] }
    expect(all.skills.map(s => s.name)).toEqual(['race'])
  })

  it('list_skills returns { error } instead of throwing when the underlying table is missing', async () => {
    await client.execute('DROP TABLE skills')
    try {
      const result = await listSkills() as { error: string }
      expect(result.error).toMatch(/no such table|failed query/i)
    } finally {
      await client.execute(`
        CREATE TABLE skills (
          id text PRIMARY KEY NOT NULL,
          name text NOT NULL,
          description text NOT NULL,
          content text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        )
      `)
      await client.execute('CREATE UNIQUE INDEX skills_name_idx ON skills (name)')
    }
  })
})
