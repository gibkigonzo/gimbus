import { tool } from 'ai'
import sharp from 'sharp'
import { blob } from 'hub:blob'
import { z } from 'zod'
import path from 'node:path'
import { toolSuccess, toolError } from '../tool-runtime/tool-response'

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

export const imageProcessTool = tool({
  description: 'Use this when the user wants to transform an image they attached (e.g. convert to grayscale, black-and-white, resize, rotate, change format). Returns a status message indicating success or failure.',
  inputSchema: argsSchema,
  execute: async (args) => {
    try {
      const sourceBlob = await blob.get(args.pathname)
      if (!sourceBlob) {
        return toolError(`Blob not found: ${args.pathname}`)
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

      return toolSuccess({
        message: 'Image processed successfully. It\'s displayed in the tool result block. Do not return the URL or pathname in the assistant\'s text response.',
        pathname: result.pathname
      })
    } catch (err: unknown) {
      return toolError((err as Error).message)
    }
  }
})

function inferExt(pathname: string): string {
  const ext = path.extname(pathname).replace('.', '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'].includes(ext)) return ext
  return 'jpeg'
}
