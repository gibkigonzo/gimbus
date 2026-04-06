import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import sharp from 'sharp'
import { blob } from 'hub:blob'
import { z } from 'zod'
import { analyzeImageStructured } from '../openrouter'

const MAX_VISION_BYTES = 2 * 1024 * 1024
const MAX_VISION_PX = 1500

const argsSchema = z.object({
  pathname: z.string().min(1),
  question: z.string().min(1)
})

const ResultSchema = z.object({
  result: z.string().describe('Answer to the question about the image')
})

export const analyzeImageTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'analyze_image',
    description: 'Ask a specific question about an uploaded image. Use this after finding the image\'s blob_pathname in its .description.md file. Pass the exact question the user is asking.',
    parameters: {
      type: 'object',
      properties: {
        pathname: {
          type: 'string',
          description: 'The blob pathname of the image, found in the blob_pathname field of the image\'s .description.md file.'
        },
        question: {
          type: 'string',
          description: 'The specific question to answer about the image.'
        }
      },
      required: ['pathname', 'question']
    }
  }
}

export async function handleAnalyzeImage(rawArgs: Record<string, unknown>): Promise<unknown> {
  const args = argsSchema.parse(rawArgs)

  const blobData = await blob.get(args.pathname)
  if (!blobData) {
    throw new Error(`Image not found in blob storage: ${args.pathname}`)
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
    'openai/gpt-4o-mini'
  )

  return { result }
}
