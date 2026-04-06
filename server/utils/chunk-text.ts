import fs from 'node:fs/promises'
import path from 'node:path'

const CHUNK_SIZE = 500 // lines per chunk

export interface ChunkResult {
  playgroundPath: string
  isChunked: boolean
  chunkCount: number
}

/**
 * Writes text content to the playground directory.
 * Files with >500 lines are split into numbered chunk files.
 * `playgroundRelDir` is relative to the project root (e.g. 'playground/uploads/{fileId}').
 */
export async function chunkAndWriteText(
  text: string,
  playgroundRelDir: string,
  baseName: string
): Promise<ChunkResult> {
  await fs.mkdir(playgroundRelDir, { recursive: true })

  const lines = text.split('\n')

  if (lines.length <= CHUNK_SIZE) {
    const filePath = path.join(playgroundRelDir, `${baseName}.txt`)
    await fs.writeFile(filePath, text, 'utf-8')
    return { playgroundPath: `${playgroundRelDir}/${baseName}.txt`, isChunked: false, chunkCount: 1 }
  }

  const chunks: string[][] = []
  for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
    chunks.push(lines.slice(i, i + CHUNK_SIZE))
  }

  await Promise.all(
    chunks.map(async (chunk, idx) => {
      const num = String(idx + 1).padStart(3, '0')
      const filePath = path.join(playgroundRelDir, `${baseName}_chunk_${num}.txt`)
      await fs.writeFile(filePath, chunk.join('\n'), 'utf-8')
    })
  )

  // playgroundPath is the full MCP-ready path (e.g. playground/uploads/{fileId})
  return { playgroundPath: playgroundRelDir, isChunked: true, chunkCount: chunks.length }
}
