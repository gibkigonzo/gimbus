import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { grepFile } from './grep'

let dir: string
let filePath: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'grep-test-'))
  filePath = join(dir, 'sample.csv')
  await writeFile(filePath, [
    'Rezystor metalizowany 1 ohm,BWST28',
    'Kabel USB-C 1m,K1M001',
    'Kabel USB-C 2m,K2M002',
    'Wentylator 12V 40mm,Q49G1Y',
    'WENTYLATOR 24V 60mm,UB4BII'
  ].join('\n'))
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('grepFile', () => {
  it('returns matching lines with 1-indexed line numbers', async () => {
    const matches = await grepFile(filePath, 'Kabel')
    expect(matches).toEqual([
      { line: 2, text: 'Kabel USB-C 1m,K1M001' },
      { line: 3, text: 'Kabel USB-C 2m,K2M002' }
    ])
  })

  it('is case-sensitive by default', async () => {
    const matches = await grepFile(filePath, 'wentylator')
    expect(matches).toEqual([])
  })

  it('matches case-insensitively when requested', async () => {
    const matches = await grepFile(filePath, 'wentylator', { caseInsensitive: true })
    expect(matches).toHaveLength(2)
  })

  it('supports regex alternation patterns', async () => {
    const matches = await grepFile(filePath, 'Kabel|Rezystor')
    expect(matches).toHaveLength(3)
  })

  it('stops early once maxResults is reached', async () => {
    const matches = await grepFile(filePath, 'Kabel', { maxResults: 1 })
    expect(matches).toEqual([{ line: 2, text: 'Kabel USB-C 1m,K1M001' }])
  })

  it('falls back to literal matching for invalid regex patterns', async () => {
    const matches = await grepFile(filePath, '[', { caseInsensitive: true })
    expect(matches).toEqual([])
  })

  it('returns no matches for a pattern not present', async () => {
    const matches = await grepFile(filePath, 'nonexistent-token')
    expect(matches).toEqual([])
  })
})
