import { z } from 'zod'
import { db, schema } from 'hub:db'
import { MODELS } from '#shared/utils/models'
import type { LoopContext, AgentLoopResult, SseChunk } from '#shared/types/agent-runtime'
import { getChatWithMessages } from '../../utils/db/queries'
import { formatUserContent, stripUserContentXml } from '../../utils/agent/history'
import { resolveSkillPrefix } from '../../utils/agent/skill-prefix'
import { buildContext } from '../../utils/agent/context'
import { saveTurn } from '../../utils/agent/persist'
import { maybeGenerateChatTitle } from '../../utils/agent/title'
import { resolveAgentDefinition } from '../../utils/tools/delegate-agents'

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

// "@name rest" — routes directly to a registered delegate agent (see
// delegate-agents.ts), bypassing the main system prompt/tool set and the
// model's own judgment on whether to delegate. Lookup is case-insensitive
// (resolveAgentDefinition), so "@Researcher"/"@researcher" resolve the same
// way; a name that still doesn't match any registered agent (unknown agent,
// or a genuine typo) is a deliberate no-op — falls through to the normal
// chat path rather than guessing or erroring. Kept out of scope when files
// are attached (v1) so ordinary attachment handling is never affected.
const MENTION_PATTERN = /^@(\w+)\b\s*([\s\S]*)$/

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
  // A sealed:false assistant row is the leftover of a turn cut short by an
  // abort (see persist.ts) — it doesn't count as "the first turn completed",
  // otherwise resuming an interrupted first turn would permanently skip
  // title generation (isFirstTurn would already read false on resume).
  const isFirstTurn = chat.messages.every(m => m.role !== 'assistant' || !m.sealed)

  const hasFiles = !!files?.length

  // "/skillname" resolution is shared with chats.post.ts (a chat's very
  // first message) so it behaves identically regardless of turn number —
  // resolved before formatUserContent runs, so the DB=LLM invariant holds
  // (whatever string comes out of this is exactly what's saved and sent).
  const messageForContent = message ? await resolveSkillPrefix(message, hasFiles) : message

  // Build XML content once — same string saved to DB and sent to LLM
  const userContent = messageForContent ? formatUserContent(messageForContent, files) : undefined

  // Saved immediately, before the loop runs — not gated behind the turn
  // completing. A dropped connection (refresh, closed tab) mid-generation
  // must not also cost you the message you just typed.
  if (userContent) {
    await db.insert(schema.messages).values({
      chatId: id,
      role: 'user',
      content: userContent,
      model,
      attachments: files && files.length > 0 ? JSON.stringify(files) : null
    })
  }

  function buildOnCompleted(agentSource?: string) {
    return async (result: AgentLoopResult, pushSse: (chunk: SseChunk) => void | Promise<void>) => {
      await saveTurn(id, model, result, { sealed: !result.aborted, agentSource })
      // On the real first turn the frontend triggers the loop with no `message`
      // (it was already saved by POST /api/chats) — fall back to the persisted
      // first user message rather than requiring a freshly-sent one.
      const firstUserContent = userContent ?? chat.messages.find(m => m.role === 'user')?.content ?? undefined
      await maybeGenerateChatTitle(id, model, isFirstTurn, firstUserContent, result, pushSse)
    }
  }

  // A brand-new chat's very first message is saved by POST /api/chats, then
  // the frontend triggers this turn with no fresh `message` at all — without
  // this fallback, "@name ..." typed as literally the first message in a chat
  // would never reach MENTION_PATTERN. The same no-message triggerAgent()
  // call also happens for the "Wygeneruj odpowiedź" interrupted-turn recovery
  // (CLAUDE.md) on a *later* turn — so this looks at the most recently saved
  // user row, not specifically the chat's first message, so resuming an
  // interrupted @mention turn re-enters mention routing instead of silently
  // falling through to the main agent with the wrong system prompt/tool set.
  const resumedUserRow = !message ? [...chat.messages].reverse().find(m => m.role === 'user') : undefined
  const resumedUserHasFiles = !!resumedUserRow?.attachments
  const mentionSourceText = message ?? (resumedUserRow && !resumedUserHasFiles ? stripUserContentXml(resumedUserRow.content ?? '') : undefined)

  const mentionMatch = !hasFiles && !resumedUserHasFiles && mentionSourceText ? mentionSourceText.match(MENTION_PATTERN) : null
  const agentDef = mentionMatch ? resolveAgentDefinition(mentionMatch[1]!) : undefined
  const mentionTask = mentionMatch?.[2]?.trim()

  if (mentionMatch && agentDef && mentionTask) {
    const runtime = event.context.$toolRuntime
    const activeToolNames = agentDef.allowTools ?? runtime.defaultSubAgentToolNames
    const agentSource = mentionMatch[1]!.toLowerCase()

    // The DB row (userContent, already inserted above) keeps the full
    // "@name ..." XML-wrapped text — CLAUDE.md's DB=LLM invariant is about
    // never letting a *replayed, cached* conversation diverge from what's
    // stored, which doesn't apply here: a mention turn is a fresh, one-shot
    // LoopContext with no history and nothing to replay on a later turn, so
    // there's no prefix cache to protect. The sub-agent gets `mentionTask`
    // (the address prefix and XML wrapper already stripped) instead of the
    // raw saved string, matching what `delegate.ts` already sends its own
    // sub-agents (task.message) — the agent's system prompt has no idea what
    // "@name" or "<message>" mean, so handing it the wrapped text just adds
    // noise the model has to work around.
    const mentionContext: LoopContext = {
      system: { role: 'system', content: agentDef.systemPrompt },
      messages: [{ role: 'user', content: mentionTask }]
    }

    return runStreamingAgentLoop({
      event,
      context: mentionContext,
      model,
      chatId: id,
      allowTools: activeToolNames,
      agentName: `mention:${agentSource}`,
      onCompleted: buildOnCompleted(agentSource)
    })
  }

  const context = await buildContext(
    chat.messages,
    userContent ? { content: userContent, files } : undefined
  )

  return runStreamingAgentLoop({
    event,
    context,
    model,
    chatId: id,
    allowTools,
    onCompleted: buildOnCompleted()
  })
})
