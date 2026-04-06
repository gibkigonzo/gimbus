import { blob } from 'hub:blob'
import { db, schema } from 'hub:db'
import sharp from 'sharp'
import { extractText } from 'unpdf'
import path from 'node:path'
import { z } from 'zod'
import { chunkAndWriteText } from '../../utils/chunk-text'
import { analyzeImageStructured } from '../../utils/openrouter'
import fs from 'node:fs/promises'

const MAX_VISION_BYTES = 2 * 1024 * 1024 // 2 MB
const MAX_VISION_PX = 1500

const ImageDescriptionSchema = z.object({
  description: z.string().describe('Detailed visual description of the image')
})

export default defineEventHandler(async (event) => {
  const fileId = crypto.randomUUID()

  const result = await blob.handleUpload(event, {
    formKey: 'files',
    multiple: false,
    ensure: {
      maxSize: FILE_UPLOAD_CONFIG.maxSize,
      types: [...FILE_UPLOAD_CONFIG.types]
    },
    put: {
      addRandomSuffix: true,
      prefix: `uploads/${fileId}`
    }
  })

  const objects = Array.isArray(result) ? result : [result]

  const enriched = await Promise.all(
    objects.map(async (obj) => {
      const mediaType: string = obj.contentType ?? 'application/octet-stream'
      const originalName = path.basename(obj.pathname)
      const baseName = path.basename(originalName, path.extname(originalName))
      const playgroundDir = `playground/uploads/${fileId}`

      let playgroundPath: string | null = null
      let isChunked = false
      let descriptionPath: string | null = null
      let description: string | null = null

      try {
        if (mediaType === 'text/plain' || mediaType === 'text/csv') {
          const blobData = await blob.get(obj.pathname)
          if (blobData) {
            const text = await blobData.text()
            const result = await chunkAndWriteText(text, playgroundDir, baseName)
            playgroundPath = result.playgroundPath
            isChunked = result.isChunked
            description = text.slice(0, 200) || null
          }
        }
        else if (mediaType.startsWith('image/')) {
          const blobData = await blob.get(obj.pathname)
          if (blobData) {
            let buffer = Buffer.from(await blobData.arrayBuffer()) as Buffer

            // Resize large images in-memory before sending to vision API
            if (buffer.length > MAX_VISION_BYTES) {
              buffer = await sharp(buffer)
                .resize(MAX_VISION_PX, MAX_VISION_PX, { fit: 'inside', withoutEnlargement: true })
                .toBuffer()
            }

            const base64 = buffer.toString('base64')
            const dataUrl = `data:${mediaType};base64,${base64}`

            const { description: desc } = await analyzeImageStructured(
              dataUrl,
              'Describe this image in detail. Include what is shown, colors, text (if any), layout, and any notable elements.',
              ImageDescriptionSchema,
              'openai/gpt-4o-mini'
            )

            await fs.mkdir(playgroundDir, { recursive: true })
            const descFile = `${playgroundDir}/${baseName}.description.md`
            const frontmatter = `---\nblob_pathname: ${obj.pathname}\nmediaType: ${mediaType}\n---\n${desc}`
            await fs.writeFile(descFile, frontmatter, 'utf-8')

            descriptionPath = null
            playgroundPath = `playground/uploads/${fileId}/${baseName}.description.md`
            description = desc.slice(0, 200)
          }
        }
        else if (mediaType === 'application/pdf') {
          const blobData = await blob.get(obj.pathname)
          if (blobData) {
            const buffer = Buffer.from(await blobData.arrayBuffer())
            const { text } = await extractText(buffer, { mergePages: true })
            const fullText = Array.isArray(text) ? text.join('\n') : (text ?? '')
            const result = await chunkAndWriteText(fullText, playgroundDir, baseName)
            playgroundPath = result.playgroundPath
            isChunked = result.isChunked
            description = fullText.slice(0, 200) || null
          }
        }
      }
      catch (err) {
        console.error(`[upload] Failed to process ${obj.pathname}:`, err)
      }

      await db.insert(schema.files).values({
        id: fileId,
        originalName,
        mediaType,
        pathname: obj.pathname,
        playgroundPath: playgroundPath ?? null,
        isChunked,
        descriptionPath: descriptionPath ?? null,
        description: description ?? null,
        size: obj.size ?? 0
      })

      return {
        fileId,
        pathname: obj.pathname,
        mediaType,
        originalName,
        playgroundPath,
        isChunked,
        description: description ?? null,
        size: obj.size ?? 0
      }
    })
  )

  return enriched
})
