import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title'),
  // Set by server/tasks/agent/scheduled-run.ts after an unattended run completes;
  // cleared by POST /api/chats/[id]/seen once the user actually opens the chat
  // (deliberately not GET /api/chats/[id] — that's also hit by the sidebar's
  // background prefetch, which isn't a real visit). Surfaces background-run
  // status in the sidebar without requiring the user to poll it.
  needsAttention: integer('needs_attention', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
})

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages)
}))

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  content: text('content'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  cachedTokens: integer('cached_tokens'),
  toolCalls: text('tool_calls'),
  toolCallId: text('tool_call_id'),
  toolCalledWith: text('tool_called_with'),
  attachments: text('attachments'),
  sealed: integer('sealed', { mode: 'boolean' }).notNull().default(false),
  // Set on assistant/tool rows produced by an @mention-routed sub-agent turn
  // (server/api/chats/[id].post.ts) — null for ordinary main-agent turns.
  // Lets buildContext() (context.ts) flag these rows as not-the-main-agent's-
  // own words when replaying history to a later ordinary turn.
  agentSource: text('agent_source'),
  ...timestamps
}, table => [
  index('messages_chat_id_idx').on(table.chatId)
])

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  })
}))

export const files = sqliteTable('files', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  originalName: text('original_name').notNull(),
  mediaType: text('media_type').notNull(),
  pathname: text('pathname').notNull(),
  playgroundPath: text('playground_path'),
  descriptionPath: text('description_path'),
  description: text('description'),
  size: integer('size').notNull(),
  ...timestamps
})

// Global, cross-chat memory for the `recall`/`remember` tools — not scoped by
// chatId. Each fact is its own row, written via an atomic upsert on
// (category, key), so no optimistic-concurrency version field is needed
// (unlike the whole-blob useStorage KV pattern used by manage_tasks).
export const memories = sqliteTable('memories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  category: text('category').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  uniqueIndex('memories_category_key_idx').on(table.category, table.key)
])

// Predefined instruction snippets — injected into a conversation either by
// model decision (list_skills -> get_skill) or by explicit user action (a
// "/name" prefix on a chat message, parsed in POST /api/chats/[id]). Flat
// (no category) unlike `memories`, since a skill is addressed by name alone.
export const skills = sqliteTable('skills', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  description: text('description').notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}, table => [
  uniqueIndex('skills_name_idx').on(table.name)
])
