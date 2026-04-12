import { z } from 'zod'
import { MODELS } from '#shared/utils/models'
import { getChatWithMessages } from '../../utils/db/queries'
import { formatUserContent } from '../../utils/agent/history'
import { buildContext } from '../../utils/agent/context'
import { saveTurn } from '../../utils/agent/persist'

const fileAttachmentSchema = z.object({
  type: z.literal('file'),
  mediaType: z.string(),
  pathname: z.string(),
  fileId: z.string().optional(),
  playgroundPath: z.string().optional()
})

const bodySchema = z.object({
  model: z.string().refine(value => MODELS.some(m => m.value === value), {
    message: 'Invalid model'
  }),
  message: z.string().min(1).optional(),
  allowTools: z.array(z.string()).optional(),
  files: z.array(fileAttachmentSchema).optional()
})

defineRouteMeta({
  openAPI: {
    description: 'Chat with AI.',
    tags: ['ai']
  }
})
export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, z.object({
    id: z.string()
  }).parse)

  const { model, message, allowTools, files } = await readValidatedBody(event, bodySchema.parse)

  const chat = await getChatWithMessages(id)

  // Build XML content once — same string saved to DB and sent to LLM
  const userContent = message ? formatUserContent(message, files) : undefined

  const context = await buildContext(
    chat.messages,
    userContent ? { content: userContent, files } : undefined
  )

  return runStreamingAgentLoop({
    event,
    context,
    model,
    allowTools,
    onCompleted: (result) => saveTurn(id, model, result, userContent, files)
  })
})
