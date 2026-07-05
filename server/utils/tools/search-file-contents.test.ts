import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { ToolExecutionOptions } from 'ai'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'

const getChatWithMessagesMock = vi.fn()
vi.mock('../db/queries', () => ({
  getChatWithMessages: (...args: unknown[]) => getChatWithMessagesMock(...args)
}))

const { grepFilesTool } = await import('./search-file-contents')

const toolOptions: ToolExecutionOptions = { toolCallId: 'call_1', messages: [] }

// Always-allowed regardless of chatId (see ALWAYS_ALLOWED_PREFIXES in playground-scope.ts)
const workflowsTestDir = path.join('playground', 'workflows', '__test_grep__')
const workflowsTestFile = path.join(workflowsTestDir, 'sample.csv')

// Only reachable once attached to a specific chat
const uploadsTestDir = path.join('playground', '__test_grep_uploads__')
const uploadsTestFile = path.join(uploadsTestDir, 'sample.csv')

beforeAll(async () => {
  await mkdir(workflowsTestDir, { recursive: true })
  await writeFile(workflowsTestFile, ['Kabel USB-C 1m,K1M001', 'Wentylator 12V,Q49G1Y'].join('\n'))
  await mkdir(uploadsTestDir, { recursive: true })
  await writeFile(uploadsTestFile, ['Kabel USB-C 1m,K1M001', 'Wentylator 12V,Q49G1Y'].join('\n'))
})

afterAll(async () => {
  await rm(workflowsTestDir, { recursive: true, force: true })
  await rm(uploadsTestDir, { recursive: true, force: true })
})

describe('grep_files', () => {
  it('returns matches for an always-allowed path with no chatId', async () => {
    const result = await grepFilesTool.execute!(
      { path: workflowsTestFile, pattern: 'Kabel' },
      toolOptions
    ) as { matches: { line: number, text: string }[] }
    expect(result.matches).toEqual([{ line: 1, text: 'Kabel USB-C 1m,K1M001' }])
  })

  it('rejects a path outside the chat\'s allowed prefixes', async () => {
    getChatWithMessagesMock.mockResolvedValue({ messages: [] })
    const result = await grepFilesTool.execute!(
      { path: uploadsTestFile, pattern: 'Kabel' },
      { ...toolOptions, experimental_context: { model: 'm', chatId: 'chat-1' } }
    ) as { error: string }
    expect(result.error).toMatch(/not allowed/)
  })

  it('allows a path attached to the given chat', async () => {
    getChatWithMessagesMock.mockResolvedValue({
      messages: [{ attachments: JSON.stringify([{ type: 'file', mediaType: 'text/csv', pathname: 'x', playgroundPath: uploadsTestFile }]) }]
    })
    const result = await grepFilesTool.execute!(
      { path: uploadsTestFile, pattern: 'Wentylator' },
      { ...toolOptions, experimental_context: { model: 'm', chatId: 'chat-1' } }
    ) as { matches: { line: number, text: string }[] }
    expect(result.matches).toEqual([{ line: 2, text: 'Wentylator 12V,Q49G1Y' }])
  })

  it('rejects a path that does not start with playground/', async () => {
    const result = await grepFilesTool.execute!({ path: 'etc/passwd', pattern: 'root' }, toolOptions) as { error: string }
    expect(result.error).toMatch(/within playground\//)
  })

  it('rejects a traversal attempt that normalizes outside playground/', async () => {
    const result = await grepFilesTool.execute!({ path: 'playground/../server/index.ts', pattern: 'x' }, toolOptions) as { error: string }
    expect(result.error).toMatch(/within playground\//)
  })

  it('returns an error for a missing file', async () => {
    const result = await grepFilesTool.execute!({ path: 'playground/workflows/__test_grep__/missing.csv', pattern: 'x' }, toolOptions) as { error: string }
    expect(result.error).toMatch(/not found/)
  })
})
