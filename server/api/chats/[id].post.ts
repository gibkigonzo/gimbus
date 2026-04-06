import { z } from 'zod'
import { MODELS } from '#shared/utils/models'
import { getChatWithMessages, sealMessages, updateChatMemoryLog } from '../../utils/db/queries'
import { buildHistory, formatUserContent, persistAgentTurn } from '../../utils/agent/history'
import { runObserver } from '../../utils/agent/memory'

const fileAttachmentSchema = z.object({
  type: z.literal('file'),
  mediaType: z.string(),
  pathname: z.string(),
  fileId: z.string().optional(),
  playgroundPath: z.string().optional(),
  isChunked: z.boolean().optional()
})

const bodySchema = z.object({
  model: z.string().refine(value => MODELS.some(m => m.value === value), {
    message: 'Invalid model'
  }),
  message: z.string().min(1).optional(),
  allowTools: z.array(z.string()).optional(),
  mode: z.enum(['plan', 'act']).optional(),
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

  const { model, message, allowTools, mode, files } = await readValidatedBody(event, bodySchema.parse)

  const chat = await getChatWithMessages(id)

  // Build XML content once — same string saved to DB and sent to LLM
  const userContent = message ? formatUserContent(message, files, mode) : undefined

  // Save incoming user message (only for follow-up messages; initial message is saved on chat creation)
  if (userContent) {
    await db.insert(schema.messages).values({
      chatId: id,
      role: 'user',
      content: userContent,
      model,
      attachments: files && files.length > 0 ? JSON.stringify(files) : null
    })
  }

  const history = await buildHistory(
    chat.messages,
    userContent ? { content: userContent, files } : undefined,
    chat.memoryLog ?? undefined
  )

  const OBSERVER_TOKEN_THRESHOLD = 30_000

  // Sum tokens from unsealed messages already in DB (excludes current turn)
  const previousUnsealedTokens = chat.messages
    .filter(m => !m.sealed)
    .reduce((sum, m) => sum + (m.inputTokens ?? 0) + (m.outputTokens ?? 0), 0)

  return runStreamingAgentLoop({
    event,
    initialMessages: history,
    model,
    allowTools,
    maxIterations: 15,
    onCompleted: async ({ finalMessages, usagePerTurn }) => {
      await persistAgentTurn({ chatId: chat.id, model, finalMessages, historyLength: history.length, usagePerTurn })

      // Fire-and-forget: run Observer if accumulated tokens exceed threshold
      const currentTurnTokens = usagePerTurn
        .filter((u): u is AssistantUsage => u !== null)
        .reduce((sum, u) => sum + u.inputTokens + u.outputTokens, 0)

      const totalUnsealedTokens = previousUnsealedTokens + currentTurnTokens

      if (totalUnsealedTokens > OBSERVER_TOKEN_THRESHOLD) {
        Promise.resolve().then(async () => {
          const newLog = await runObserver(chat.memoryLog ?? null, finalMessages)
          await updateChatMemoryLog(chat.id, newLog)
          await sealMessages(chat.id)
        }).catch(err => console.error('[memory] Observer failed:', err))
      }
    }
  })
})
