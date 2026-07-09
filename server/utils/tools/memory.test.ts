import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../db/schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })

await client.execute(`
  CREATE TABLE memories (
    id text PRIMARY KEY NOT NULL,
    category text NOT NULL,
    key text NOT NULL,
    value text NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`)
await client.execute('CREATE UNIQUE INDEX memories_category_key_idx ON memories (category, key)')

vi.mock('hub:db', () => ({ db, schema }))

const { recallTool, rememberTool } = await import('./memory')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

function recall(args: { operation: 'list_categories' | 'list_keys' | 'get_value', category?: string, key?: string }) {
  return recallTool.execute!(args, toolOptions)
}

function remember(args: { category: string, key: string, value: string }) {
  return rememberTool.execute!(args, toolOptions)
}

describe('recall / remember', () => {
  beforeEach(async () => {
    await client.execute('DELETE FROM memories')
  })

  it('remember inserts a new fact', async () => {
    const result = await remember({ category: 'persona', key: 'name', value: 'Gimbus' }) as { category: string, key: string, value: string }
    expect(result).toEqual({ category: 'persona', key: 'name', value: 'Gimbus' })
  })

  it('remember overwrites an existing category+key rather than duplicating it', async () => {
    await remember({ category: 'persona', key: 'mood', value: 'curious' })
    await remember({ category: 'persona', key: 'mood', value: 'content' })
    const result = await recall({ operation: 'get_value', category: 'persona', key: 'mood' }) as { value: string }
    expect(result.value).toBe('content')

    const keys = await recall({ operation: 'list_keys', category: 'persona' }) as { keys: string[] }
    expect(keys.keys).toEqual(['mood'])
  })

  it('handles concurrent remember calls to the same key without throwing', async () => {
    const results = await Promise.all([
      remember({ category: 'persona', key: 'trait', value: 'a' }),
      remember({ category: 'persona', key: 'trait', value: 'b' })
    ])
    expect(results.every(r => 'category' in r)).toBe(true)
    const keys = await recall({ operation: 'list_keys', category: 'persona' }) as { keys: string[] }
    expect(keys.keys).toEqual(['trait'])
  })

  it('list_categories returns counts with no values', async () => {
    await remember({ category: 'persona', key: 'name', value: 'Gimbus' })
    await remember({ category: 'persona', key: 'mood', value: 'curious' })
    await remember({ category: 'user', key: 'timezone', value: 'Europe/Warsaw' })

    const result = await recall({ operation: 'list_categories' }) as { categories: { category: string, count: number }[] }
    const byCategory = Object.fromEntries(result.categories.map(c => [c.category, c.count]))
    expect(byCategory).toEqual({ persona: 2, user: 1 })
  })

  it('list_keys returns an empty array for a category with no rows', async () => {
    const result = await recall({ operation: 'list_keys', category: 'nonexistent' }) as { keys: string[] }
    expect(result.keys).toEqual([])
  })

  it('list_keys requires category', async () => {
    const result = await recall({ operation: 'list_keys' }) as { error: string }
    expect(result.error).toMatch(/category/)
  })

  it('get_value returns an error when the fact does not exist', async () => {
    const result = await recall({ operation: 'get_value', category: 'persona', key: 'missing' }) as { error: string }
    expect(result.error).toMatch(/No memory found/)
  })

  it('get_value requires category and key', async () => {
    const result = await recall({ operation: 'get_value', category: 'persona' }) as { error: string }
    expect(result.error).toMatch(/required/)
  })

  it('recall returns { error } instead of throwing when the underlying table is missing', async () => {
    await client.execute('DROP TABLE memories')
    try {
      const result = await recall({ operation: 'list_categories' }) as { error: string }
      expect(result.error).toMatch(/no such table|failed query/i)
    } finally {
      await client.execute(`
        CREATE TABLE memories (
          id text PRIMARY KEY NOT NULL,
          category text NOT NULL,
          key text NOT NULL,
          value text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        )
      `)
      await client.execute('CREATE UNIQUE INDEX memories_category_key_idx ON memories (category, key)')
    }
  })

  it('remember returns { error } instead of throwing when the underlying table is missing', async () => {
    await client.execute('DROP TABLE memories')
    try {
      const result = await remember({ category: 'persona', key: 'name', value: 'Gimbus' }) as { error: string }
      expect(result.error).toMatch(/no such table|failed query/i)
    } finally {
      await client.execute(`
        CREATE TABLE memories (
          id text PRIMARY KEY NOT NULL,
          category text NOT NULL,
          key text NOT NULL,
          value text NOT NULL,
          created_at integer NOT NULL,
          updated_at integer NOT NULL
        )
      `)
      await client.execute('CREATE UNIQUE INDEX memories_category_key_idx ON memories (category, key)')
    }
  })
})
