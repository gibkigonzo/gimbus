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
    description: 'Publish a file from the playground to blob storage and return a download URL.',
    parameters: {
      type: 'object',
      properties: {
        playground_path: {
          type: 'string',
          description: 'Path to the file within the playground directory. Must start with "playground/uploads/".'
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

export async function handlePublishForDownload(rawArgs: Record<string, unknown>, _model: string): Promise<unknown> {
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

  if (!stat?.isFile()) {
    throw new Error(`File not found in playground: ${normalized}`)
  }

  content = await fs.readFile(targetAbs)
  outputFilename = args.filename ?? path.basename(normalized)

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
