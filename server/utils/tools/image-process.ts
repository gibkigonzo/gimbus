import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import sharp from 'sharp'
import { blob } from 'hub:blob'
import { z } from 'zod'
import path from 'node:path'

const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('grayscale') }),
  z.object({ type: z.literal('bw') }),
  z.object({
    type: z.literal('resize'),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']).optional()
  }),
  z.object({
    type: z.literal('rotate'),
    degrees: z.number()
  }),
  z.object({
    type: z.literal('format'),
    output: z.enum(['jpeg', 'png', 'webp']),
    quality: z.number().int().min(1).max(100).optional()
  })
])

const argsSchema = z.object({
  pathname: z.string().min(1),
  operations: z.array(operationSchema).min(1)
})

export const imageProcessTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'image_process',
    description: 'Use this when the user wants to transform an image they attached (e.g. convert to grayscale, black-and-white, resize, rotate, change format). Returns a status message indicating success or failure.',
    parameters: {
      type: 'object',
      properties: {
        pathname: {
          type: 'string',
          description: 'The blob pathname of the source image, as provided in the <attachments> context block (e.g. "chatId/image-abc123.jpg").'
        },
        operations: {
          type: 'array',
          description: 'List of image operations to apply in order.',
          items: {
            type: 'object',
            discriminator: { propertyName: 'type' },
            oneOf: [
              {
                properties: {
                  type: { type: 'string', enum: ['grayscale'], description: 'Convert the image to grayscale.' }
                },
                required: ['type']
              },
              {
                properties: {
                  type: { type: 'string', enum: ['bw'], description: 'Convert the image to pure black-and-white (1-bit). Output will be PNG.' }
                },
                required: ['type']
              },
              {
                properties: {
                  type: { type: 'string', enum: ['resize'], description: 'Resize the image.' },
                  width: { type: 'integer', description: 'Target width in pixels.' },
                  height: { type: 'integer', description: 'Target height in pixels.' },
                  fit: { type: 'string', enum: ['cover', 'contain', 'fill', 'inside', 'outside'], description: 'How to fit the image into the target dimensions. Defaults to "inside" (no upscaling).' }
                },
                required: ['type']
              },
              {
                properties: {
                  type: { type: 'string', enum: ['rotate'], description: 'Rotate the image.' },
                  degrees: { type: 'number', description: 'Degrees clockwise to rotate (e.g. 90, 180, 270).' }
                },
                required: ['type', 'degrees']
              },
              {
                properties: {
                  type: { type: 'string', enum: ['format'], description: 'Convert output format.' },
                  output: { type: 'string', enum: ['jpeg', 'png', 'webp'], description: 'Target format.' },
                  quality: { type: 'integer', description: 'Compression quality 1-100 (jpeg/webp only).' }
                },
                required: ['type', 'output']
              }
            ]
          },
          minItems: 1
        }
      },
      required: ['pathname', 'operations']
    }
  }
}

export async function handleImageProcess(rawArgs: Record<string, unknown>): Promise<unknown> {
  const args = argsSchema.parse(rawArgs)

  const sourceBlob = await blob.get(args.pathname)
  if (!sourceBlob) {
    throw new Error(`Blob not found: ${args.pathname}`)
  }

  const sourceBuffer = Buffer.from(await sourceBlob.arrayBuffer())

  let pipeline = sharp(sourceBuffer)
  let forcePng = false
  let outputFormat: 'jpeg' | 'png' | 'webp' | null = null

  for (const op of args.operations) {
    switch (op.type) {
      case 'grayscale':
        pipeline = pipeline.grayscale()
        break
      case 'bw':
        pipeline = pipeline.grayscale().threshold(128)
        forcePng = true
        break
      case 'resize':
        pipeline = pipeline.resize(op.width ?? null, op.height ?? null, {
          fit: op.fit ?? 'inside',
          withoutEnlargement: true
        })
        break
      case 'rotate':
        pipeline = pipeline.rotate(op.degrees)
        break
      case 'format':
        outputFormat = op.output
        switch (op.output) {
          case 'png':
            pipeline = pipeline.png()
            break
          case 'webp':
            pipeline = pipeline.webp(op.quality ? { quality: op.quality } : undefined)
            break
          case 'jpeg':
            pipeline = pipeline.jpeg(op.quality ? { quality: op.quality } : undefined)
            break
        }
        break
    }
  }

  // bw always overrides any explicit format operation
  if (forcePng) pipeline = pipeline.png()

  // Determine output extension and contentType
  const ext = forcePng ? 'png' : (outputFormat ?? inferExt(args.pathname))
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`

  const processedBuffer = await pipeline.toBuffer()

  // Derive output pathname from input: replace file extension and add "-processed" suffix
  const dir = path.dirname(args.pathname)
  const baseName = path.basename(args.pathname, path.extname(args.pathname))
  const outputPathname = `${dir}/${baseName}-processed.${ext}`

  const result = await blob.put(outputPathname, processedBuffer, {
    contentType,
    addRandomSuffix: true
  })

  return {
    message: 'Image processed successfully. It\'s displayed in the tool result block. Do not return the URL or pathname in the assistant\'s text response.',
    pathname: result.pathname
  }
}

function inferExt(pathname: string): string {
  const ext = path.extname(pathname).replace('.', '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) return ext
  return 'jpeg'
}
