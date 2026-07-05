import { tool } from 'ai'
import sharp from 'sharp'
import { blob } from 'hub:blob'
import { z } from 'zod'
import { analyzeImageStructured } from '../openrouter'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'
import type { ToolExecContext } from '#shared/types/tool-runtime'

const MAX_VISION_BYTES = 2 * 1024 * 1024
const MAX_VISION_PX = 1500

const argsSchema = z.object({
  pathname: z.string().min(1),
  question: z.string().min(1)
})

const ResultSchema = z.object({
  result: z.string().describe('Answer to the question about the image')
})

export const analyzeImageTool = tool({
  description: 'Ask a specific question about an uploaded image. Use this after finding the image\'s blob_pathname in its .description.md file. Pass the exact question the user is asking.',
  inputSchema: argsSchema,
  execute: async (args, { experimental_context }) => {
    try {
      const model = (experimental_context as ToolExecContext).model
      const chatId = (experimental_context as ToolExecContext).chatId

      // Strip accidental playground/ prefix — blob storage paths start with uploads/
      const pathname = args.pathname.replace(/^playground\//, '')

      const blobData = await blob.get(pathname)
      if (!blobData) {
        return toolError(`Image not found in blob storage: ${pathname}`)
      }

      let buffer = Buffer.from(await blobData.arrayBuffer()) as Buffer

      // Resize large images in-memory before vision API
      if (buffer.length > MAX_VISION_BYTES) {
        buffer = await sharp(buffer)
          .resize(MAX_VISION_PX, MAX_VISION_PX, { fit: 'inside', withoutEnlargement: true })
          .toBuffer()
      }

      // Detect media type from blob or fall back to jpeg
      const contentType = blobData.type ?? 'image/jpeg'
      const base64 = buffer.toString('base64')
      const dataUrl = `data:${contentType};base64,${base64}`

      const { result } = await analyzeImageStructured(
        dataUrl,
        args.question,
        ResultSchema,
        model,
        { chatId, agentName: 'tool:analyze_image' }
      )

      return toolSuccess({ result })
    } catch (err: unknown) {
      return toolError((err as Error).message)
    }
  }
})
