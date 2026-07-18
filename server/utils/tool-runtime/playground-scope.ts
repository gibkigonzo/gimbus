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

function normalizePlaygroundPath(path: string): string {
  return posix.normalize(path).replace(/^\.\//, '')
}

/** Normalizes `path` and checks it falls under one of `allowedPrefixes` — denies
 * `../` escapes. A path that IS an allowed prefix's directory itself (no trailing
 * slash, e.g. listing "playground/uploads/file-1" when the granted prefix is
 * "playground/uploads/file-1/") counts as allowed too, not just paths nested under it —
 * otherwise listing the very directory a prefix was granted for would be denied. */
export function isPathAllowed(path: string, allowedPrefixes: string[]): boolean {
  const normalized = normalizePlaygroundPath(path)
  return allowedPrefixes.some(prefix => normalized.startsWith(prefix) || `${normalized}/` === prefix)
}

/**
 * The underlying @modelcontextprotocol/server-filesystem process (mcp.json)
 * is itself rooted at ./playground — a relative path it receives resolves
 * against THAT root, not the project root. Every other layer (system prompt,
 * ALWAYS_ALLOWED_PREFIXES, attachments' pathname) uses "playground/"-prefixed
 * paths, so forwarding one of those as-is doubles up into
 * "<repo>/playground/playground/...", which the server reports as a missing
 * parent directory. Used by mcp-client.ts to convert an already scope-checked
 * path (checked against the ORIGINAL "playground/"-prefixed form, so
 * ALWAYS_ALLOWED_PREFIXES/attachment scoping is unaffected) into the
 * root-relative form the server actually expects.
 */
export function toServerRelativePath(path: string): string {
  const normalized = normalizePlaygroundPath(path)
  if (normalized !== 'playground' && !normalized.startsWith('playground/')) return normalized
  const stripped = normalized.slice('playground'.length).replace(/^\//, '')
  return stripped === '' ? '.' : stripped
}
