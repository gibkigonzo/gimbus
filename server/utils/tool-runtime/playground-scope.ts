import { posix } from 'node:path'
import { getChatWithMessages } from '../db/queries'
import type { FileAttachment } from '#shared/utils/file'

/** Shared, non-chat-specific reference docs — readable from every chat regardless of scope. */
export const ALWAYS_ALLOWED_PREFIXES = ['playground/workflows/']

function attachmentPrefix(attachment: FileAttachment): string | null {
  if (!attachment.playgroundPath) return null
  const dir = posix.dirname(attachment.playgroundPath)
  return dir.endsWith('/') ? dir : `${dir}/`
}

/**
 * Resolves the set of playground path prefixes a given chat is allowed to reach:
 * the shared workflow docs, plus the directory of every file ever attached to this chat.
 */
export async function getAllowedPlaygroundPrefixes(chatId: string): Promise<string[]> {
  const chat = await getChatWithMessages(chatId)
  const prefixes = new Set<string>(ALWAYS_ALLOWED_PREFIXES)

  for (const message of chat.messages) {
    if (!message.attachments) continue
    const attachments = JSON.parse(message.attachments) as FileAttachment[]
    for (const attachment of attachments) {
      const prefix = attachmentPrefix(attachment)
      if (prefix) prefixes.add(prefix)
    }
  }

  return [...prefixes]
}

/** Normalizes `path` and checks it falls under one of `allowedPrefixes` — denies `../` escapes. */
export function isPathAllowed(path: string, allowedPrefixes: string[]): boolean {
  const normalized = posix.normalize(path).replace(/^\.\//, '')
  return allowedPrefixes.some(prefix => normalized.startsWith(prefix))
}
