import { describe, it, expect, vi } from 'vitest'

const getChatWithMessagesMock = vi.fn()
vi.mock('../db/queries', () => ({
  getChatWithMessages: (...args: unknown[]) => getChatWithMessagesMock(...args)
}))

const { getAllowedPlaygroundPrefixes, isPathAllowed, ALWAYS_ALLOWED_PREFIXES } = await import('./playground-scope')

function chatWithAttachments(attachmentsPerMessage: (Record<string, unknown>[] | null)[]) {
  return {
    messages: attachmentsPerMessage.map(attachments => ({
      attachments: attachments ? JSON.stringify(attachments) : null
    }))
  }
}

describe('isPathAllowed', () => {
  it('allows a path that matches an allowed prefix', () => {
    expect(isPathAllowed('playground/uploads/file-1/doc.txt', ['playground/uploads/file-1/'])).toBe(true)
  })

  it('denies a path under a different prefix', () => {
    expect(isPathAllowed('playground/uploads/file-2/secret.txt', ['playground/uploads/file-1/'])).toBe(false)
  })

  it('denies a traversal attempt that normalizes outside the allowed prefix', () => {
    const path = 'playground/uploads/file-1/../file-2/secret.txt'
    expect(isPathAllowed(path, ['playground/uploads/file-1/'])).toBe(false)
  })

  it('allows the shared workflows prefix', () => {
    expect(isPathAllowed('playground/workflows/overview.md', ALWAYS_ALLOWED_PREFIXES)).toBe(true)
  })
})

describe('getAllowedPlaygroundPrefixes', () => {
  it('always includes the shared workflows prefix even with no attachments', async () => {
    getChatWithMessagesMock.mockResolvedValue(chatWithAttachments([null]))
    const prefixes = await getAllowedPlaygroundPrefixes('chat-1')
    expect(prefixes).toEqual(ALWAYS_ALLOWED_PREFIXES)
  })

  it('derives one prefix per attached file from its playgroundPath', async () => {
    getChatWithMessagesMock.mockResolvedValue(chatWithAttachments([
      [{ type: 'file', mediaType: 'text/plain', pathname: 'x', playgroundPath: 'playground/uploads/file-1/doc.txt' }]
    ]))
    const prefixes = await getAllowedPlaygroundPrefixes('chat-1')
    expect(prefixes).toContain('playground/uploads/file-1/')
  })

  it('dedupes prefixes across multiple messages', async () => {
    getChatWithMessagesMock.mockResolvedValue(chatWithAttachments([
      [{ type: 'file', mediaType: 'text/plain', pathname: 'x', playgroundPath: 'playground/uploads/file-1/a.txt' }],
      [{ type: 'file', mediaType: 'text/plain', pathname: 'x', playgroundPath: 'playground/uploads/file-1/b.txt' }]
    ]))
    const prefixes = await getAllowedPlaygroundPrefixes('chat-1')
    expect(prefixes.filter(p => p === 'playground/uploads/file-1/')).toHaveLength(1)
  })

  it('does not allow a path belonging to another chat', async () => {
    getChatWithMessagesMock.mockResolvedValue(chatWithAttachments([
      [{ type: 'file', mediaType: 'text/plain', pathname: 'x', playgroundPath: 'playground/uploads/file-1/doc.txt' }]
    ]))
    const prefixes = await getAllowedPlaygroundPrefixes('chat-1')
    expect(isPathAllowed('playground/uploads/file-2/secret.txt', prefixes)).toBe(false)
  })
})
