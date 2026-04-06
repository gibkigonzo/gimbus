import type { chats, messages, workflows } from 'hub:db:schema'

export type Chat = typeof chats.$inferSelect
export type Message = typeof messages.$inferSelect
export type Workflow = typeof workflows.$inferSelect
