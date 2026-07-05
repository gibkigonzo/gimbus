import { tool } from 'ai'
import { blob } from 'hub:blob'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'

const argsSchema = z.object({
  playground_path: z.string().min(1).describe('Path to the file within the playground directory. Must start with "playground/uploads/".'),
  filename: z.string().optional().describe('Optional filename for the download. Defaults to the base name of playground_path.')
})

export const publishForDownloadTool = tool({
  description: 'Publish a file from the playground to blob storage and return a download URL.',
  inputSchema: argsSchema,
  execute: async (args) => {
    try {
      // Security: path traversal protection — strip optional "playground/" prefix
      let normalized = path.normalize(args.playground_path)
      if (normalized.startsWith('playground/')) {
        normalized = normalized.slice('playground/'.length)
      }
      if (normalized.includes('..') || !normalized.startsWith('playground/uploads/')) {
        return { error: 'playground_path must start with "playground/uploads/" (or "playground/uploads/") and must not contain ".."' }
      }

      const playgroundRoot = path.resolve('playground')
      const targetAbs = path.join(playgroundRoot, normalized)

      const stat = await fs.stat(targetAbs).catch(() => null)

      if (!stat?.isFile()) {
        return { error: `File not found in playground: ${normalized}` }
      }

      const content = await fs.readFile(targetAbs)
      const outputFilename = args.filename ?? path.basename(normalized)

      const downloadId = crypto.randomUUID()
      const result = await blob.put(`downloads/${downloadId}/${outputFilename}`, content, {
        contentType: 'application/octet-stream',
        addRandomSuffix: false
      })

      return {
        url: `/api/blob/${result.pathname}`,
        filename: outputFilename
      }
    } catch (err: unknown) {
      return { error: (err as Error).message }
    }
  }
})
