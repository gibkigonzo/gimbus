import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface GrepMatch {
  line: number
  text: string
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Line-by-line content search over a single file. Pure Node (readline over a
 * read stream) — deliberately no dependency on a system `rg`/`grep` binary,
 * since this must work in any deploy target, not just local dev.
 */
export async function grepFile(
  absolutePath: string,
  pattern: string,
  opts?: { caseInsensitive?: boolean, maxResults?: number }
): Promise<GrepMatch[]> {
  const maxResults = opts?.maxResults ?? 100
  const flags = opts?.caseInsensitive ? 'i' : ''
  let regex: RegExp
  try {
    regex = new RegExp(pattern, flags)
  } catch {
    regex = new RegExp(escapeRegExp(pattern), flags)
  }

  const matches: GrepMatch[] = []
  const rl = createInterface({ input: createReadStream(absolutePath, { encoding: 'utf8' }), crlfDelay: Infinity })

  let lineNumber = 0
  try {
    for await (const text of rl) {
      lineNumber += 1
      if (regex.test(text)) {
        matches.push({ line: lineNumber, text })
        if (matches.length >= maxResults) break
      }
    }
  } finally {
    rl.close()
  }

  return matches
}
