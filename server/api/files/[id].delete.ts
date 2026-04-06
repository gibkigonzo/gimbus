import { blob } from 'hub:blob'
import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string().min(1)
  }).parse)

  const [file] = await db.select().from(schema.files).where(eq(schema.files.id, id))
  if (!file) {
    throw createError({ statusCode: 404, statusMessage: 'File not found' })
  }

  // Delete blob
  await blob.del(file.pathname).catch(err =>
    console.error('[delete-file] Failed to delete blob:', file.pathname, err)
  )

  const playgroundRoot = path.resolve('playground')

  // Delete playground description file
  if (file.descriptionPath) {
    const descAbs = path.join(playgroundRoot, file.descriptionPath)
    await fs.unlink(descAbs).catch(err => {
      if (err.code !== 'ENOENT') console.error('[delete-file] Failed to delete description:', descAbs, err)
    })
  }

  // Delete playground text files (single file or chunked directory)
  if (file.playgroundPath) {
    const targetAbs = path.join(playgroundRoot, file.playgroundPath)
    if (file.isChunked) {
      await fs.rm(targetAbs, { recursive: true, force: true }).catch(err =>
        console.error('[delete-file] Failed to delete chunk dir:', targetAbs, err)
      )
    }
    else {
      await fs.unlink(targetAbs).catch(err => {
        if (err.code !== 'ENOENT') console.error('[delete-file] Failed to delete file:', targetAbs, err)
      })
    }
  }

  await db.delete(schema.files).where(eq(schema.files.id, id))

  return sendNoContent(event)
})
