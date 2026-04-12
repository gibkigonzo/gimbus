import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
}

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title'),
  ...timestamps
})

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages)
}))

export const workflows = sqliteTable('workflows', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  result: text('result'),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  ...timestamps
})

export const workflowsRelations = relations(workflows, ({ many }) => ({
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
  memoryLog: text('memory_log'),
  memoryLogFull: integer('memory_log_full', { mode: 'boolean' }),
  attachments: text('attachments'),
  workflowId: text('workflow_id').references(() => workflows.id),
  sealed: integer('sealed', { mode: 'boolean' }).notNull().default(false),
  ...timestamps
}, table => [
  index('messages_chat_id_idx').on(table.chatId)
])

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, {
    fields: [messages.chatId],
    references: [chats.id]
  }),
  workflow: one(workflows, {
    fields: [messages.workflowId],
    references: [workflows.id]
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
