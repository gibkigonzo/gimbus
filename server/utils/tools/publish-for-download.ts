import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { blob } from 'hub:blob'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'

const argsSchema = z.object({
  playground_path: z.string().min(1),
  filename: z.string().optional()
})

export const publishForDownloadTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'publish_for_download',
    description: 'Publish a file (or reassembled chunked file) from the playground to blob storage and return a download URL. For chunked files, pass the directory path (e.g. "playground/uploads/{fileId}/mydoc") and the tool will reassemble all chunks in order. For a single file, pass the full path (e.g. "playground/uploads/{fileId}/data.txt").',
    parameters: {
      type: 'object',
      properties: {
        playground_path: {
          type: 'string',
          description: 'Path within the playground directory. Must start with "playground/uploads/". For chunked files, pass the directory. For single files, pass the file path.'
        },
        filename: {
          type: 'string',
          description: 'Optional filename for the download. Defaults to the base name of playground_path.'
        }
      },
      required: ['playground_path']
    }
  }
}

export async function handlePublishForDownload(rawArgs: Record<string, unknown>): Promise<unknown> {
  const args = argsSchema.parse(rawArgs)

  // Security: path traversal protection — strip optional "playground/" prefix
  let normalized = path.normalize(args.playground_path)
  if (normalized.startsWith('playground/')) {
    normalized = normalized.slice('playground/'.length)
  }
  if (normalized.includes('..') || !normalized.startsWith('playground/uploads/')) {
    throw new Error('playground_path must start with "playground/uploads/" (or "playground/uploads/") and must not contain ".."')
  }

  const playgroundRoot = path.resolve('playground')
  const targetAbs = path.join(playgroundRoot, normalized)

  let content: Buffer
  let outputFilename: string

  const stat = await fs.stat(targetAbs).catch(() => null)

  if (stat?.isDirectory()) {
    // Chunked: find all _chunk_NNN.txt files, sort, concat
    const entries = await fs.readdir(targetAbs)
    const chunkFiles = entries
      .filter(e => e.match(/_chunk_\d+\.txt$/))
      .sort()

    if (chunkFiles.length === 0) {
      throw new Error(`No chunk files found in directory: ${normalized}`)
    }

    const parts = await Promise.all(
      chunkFiles.map(f => fs.readFile(path.join(targetAbs, f), 'utf-8'))
    )
    content = Buffer.from(parts.join('\n'), 'utf-8')
    outputFilename = args.filename ?? (path.basename(normalized) + '.txt')
  }
  else if (stat?.isFile()) {
    content = await fs.readFile(targetAbs)
    outputFilename = args.filename ?? path.basename(normalized)
  }
  else {
    throw new Error(`Path not found in playground: ${normalized}`)
  }

  const downloadId = crypto.randomUUID()
  const result = await blob.put(`downloads/${downloadId}/${outputFilename}`, content, {
    contentType: 'application/octet-stream',
    addRandomSuffix: false
  })

  return {
    url: `/api/blob/${result.pathname}`,
    filename: outputFilename
  }
}
