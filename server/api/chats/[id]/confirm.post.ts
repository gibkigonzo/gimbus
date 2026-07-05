import { z } from 'zod'
import { resolveConfirmation } from '../../../utils/tool-runtime/confirmation-registry'

const bodySchema = z.object({
  confirmationId: z.string(),
  approved: z.boolean()
})

defineRouteMeta({
  openAPI: {
    description: 'Respond to a pending tool-call confirmation request for a running turn.',
    tags: ['ai']
  }
})
export default defineEventHandler(async (event) => {
  const { confirmationId, approved } = await readValidatedBody(event, bodySchema.parse)

  const found = resolveConfirmation(confirmationId, approved)
  if (!found) {
    throw createError({ statusCode: 404, statusMessage: 'Confirmation not found or already resolved' })
  }

  return { ok: true }
})
