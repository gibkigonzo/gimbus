import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../../db/schema'

const client = createClient({ url: ':memory:' })
const db = drizzle(client, { schema })

await client.execute(`
  CREATE TABLE chats (
    id text PRIMARY KEY NOT NULL,
    title text,
    needs_attention integer DEFAULT false NOT NULL,
    created_at integer NOT NULL
  )
`)
await client.execute(`
  CREATE TABLE messages (
    id text PRIMARY KEY NOT NULL,
    chat_id text NOT NULL,
    role text NOT NULL,
    content text,
    model text,
    input_tokens integer,
    output_tokens integer,
    cached_tokens integer,
    tool_calls text,
    tool_call_id text,
    tool_called_with text,
    attachments text,
    sealed integer DEFAULT false NOT NULL,
    agent_source text,
    created_at integer NOT NULL
  )
`)

vi.mock('hub:db', () => ({ db, schema }))

const { saveTurn } = await import('./persist')

async function messagesFor(chatId: string) {
  return db.query.messages.findMany({ where: (m, { eq }) => eq(m.chatId, chatId) })
}

describe('saveTurn', () => {
  const chatId = 'chat-1'

  beforeEach(async () => {
    await client.execute('DELETE FROM messages')
    await client.execute('DELETE FROM chats')
    await db.insert(schema.chats).values({ id: chatId, title: 'test' })
  })

  it('marks every inserted row sealed: true for a normally-finished turn', async () => {
    const result: AgentLoopResult = {
      messages: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'manage_tasks', arguments: '{}' } }] },
        { role: 'tool', content: '{"tasks":[]}', tool_call_id: 'call_1', toolCalledWith: '{}' },
        { role: 'assistant', content: 'All done.' }
      ],
      usagePerTurn: [{ inputTokens: 10, outputTokens: 5, cachedTokens: 0 }, { inputTokens: 3, outputTokens: 2, cachedTokens: 0 }],
      aborted: false
    }

    await saveTurn(chatId, 'openai/gpt-4o-mini', result, { sealed: true })

    const rows = await messagesFor(chatId)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.sealed === true)).toBe(true)
  })

  it('marks every inserted row sealed: false for a turn cut short by an abort', async () => {
    const result: AgentLoopResult = {
      messages: [{ role: 'assistant', content: 'partial answer before Stop was clicked' }],
      usagePerTurn: [{ inputTokens: 10, outputTokens: 5, cachedTokens: 0 }],
      aborted: true
    }

    await saveTurn(chatId, 'openai/gpt-4o-mini', result, { sealed: false })

    const rows = await messagesFor(chatId)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.sealed).toBe(false)
    expect(rows[0]!.content).toBe('partial answer before Stop was clicked')
  })

  it('persists nothing when the turn was aborted before any step completed', async () => {
    const result: AgentLoopResult = { messages: [], usagePerTurn: [], aborted: true }

    await saveTurn(chatId, 'openai/gpt-4o-mini', result, { sealed: false })

    expect(await messagesFor(chatId)).toHaveLength(0)
  })

  it('tags every inserted row with agentSource when provided (an @mention sub-agent turn)', async () => {
    const result: AgentLoopResult = {
      messages: [
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_text_file', arguments: '{}' } }] },
        { role: 'tool', content: '{}', tool_call_id: 'call_1', toolCalledWith: '{}' },
        { role: 'assistant', content: 'Summary from the researcher.' }
      ],
      usagePerTurn: [{ inputTokens: 10, outputTokens: 5, cachedTokens: 0 }, { inputTokens: 3, outputTokens: 2, cachedTokens: 0 }],
      aborted: false
    }

    await saveTurn(chatId, 'openai/gpt-4o-mini', result, { sealed: true, agentSource: 'researcher' })

    const rows = await messagesFor(chatId)
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.agentSource === 'researcher')).toBe(true)
  })

  it('leaves agentSource null for an ordinary main-agent turn', async () => {
    const result: AgentLoopResult = {
      messages: [{ role: 'assistant', content: 'Hi.' }],
      usagePerTurn: [{ inputTokens: 1, outputTokens: 1, cachedTokens: 0 }],
      aborted: false
    }

    await saveTurn(chatId, 'openai/gpt-4o-mini', result, { sealed: true })

    const rows = await messagesFor(chatId)
    expect(rows[0]!.agentSource).toBeNull()
  })
})
