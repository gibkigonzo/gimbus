import type { FileAttachment } from '#shared/utils/file'

// ─── XML helpers ────────────────────────────────────────────────────────────

function formatAttachmentsBlock(files: FileAttachment[]): string {
  const lines = files.map((f) => {
    const path = f.playgroundPath ?? f.pathname
    if (f.mediaType.startsWith('image/')) {
      return `  <file type="image" pathname="${path}" />`
    }
    const type = f.mediaType === 'application/pdf' ? 'pdf' : 'text'
    return `  <file type="${type}" pathname="${path}" />`
  })
  return `<attachments>\n${lines.join('\n')}\n</attachments>`
}

/**
 * Builds the XML content to store in DB and send to LLM.
 * Format: [<attachments>...</attachments>\n]<message>\ntext\n</message>
 */
export function formatUserContent(message: string, files?: FileAttachment[]): string {
  const attachmentsBlock = files && files.length > 0 ? `${formatAttachmentsBlock(files)}\n` : ''
  return `${attachmentsBlock}<message>\n${message}\n</message>`
}

/** Strips XML wrapper to recover plain user text for display in UI. */
export function stripUserContentXml(content: string): string {
  return content
    .replace(/^<attachments>[\s\S]*?<\/attachments>\n?/, '')
    .replace(/^<message>\n?/, '')
    .replace(/\n?<\/message>$/, '')
}
