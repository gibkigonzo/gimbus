import { describe, it, expect, beforeEach, vi } from 'vitest'
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

const { resolveSkillPrefix } = await import('./skill-prefix')

describe('resolveSkillPrefix', () => {
  beforeEach(async () => {
    await client.execute('DELETE FROM skills')
    await client.execute(
      `INSERT INTO skills (id, name, description, content, created_at, updated_at) VALUES ('s1', 'changelog-style', 'desc', 'Write terse bullet points.', 0, 0)`
    )
  })

  it('wraps a matching skill name and keeps the rest of the message', async () => {
    const result = await resolveSkillPrefix('/changelog-style summarize this PR', false)
    expect(result).toBe('<skill name="changelog-style">\nWrite terse bullet points.\n</skill>\n\nsummarize this PR')
  })

  it('leaves the message unchanged when the name matches no skill', async () => {
    const result = await resolveSkillPrefix('/nonexistent do X', false)
    expect(result).toBe('/nonexistent do X')
  })

  it('leaves the message unchanged when it has no leading slash', async () => {
    const result = await resolveSkillPrefix('changelog-style summarize this', false)
    expect(result).toBe('changelog-style summarize this')
  })

  it('skips resolution entirely when files are attached', async () => {
    const result = await resolveSkillPrefix('/changelog-style summarize this PR', true)
    expect(result).toBe('/changelog-style summarize this PR')
  })
})
