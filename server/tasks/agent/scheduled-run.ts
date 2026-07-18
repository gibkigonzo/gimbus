import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { MODELS } from '#shared/utils/models'
import type { SseChunk } from '#shared/types/agent-runtime'
import { RISKY_TOOL_NAMES } from '../../utils/tool-runtime/build'
import { resolveActiveToolNames } from '../../utils/agent/tool-selection'
import { runAgentLoopCore } from '../../utils/agent/core-loop'
import { saveTurn } from '../../utils/agent/persist'
import { buildContext } from '../../utils/agent/context'
import { formatUserContent } from '../../utils/agent/history'
import { producedAssistantText } from '../../utils/agent/run-outcome'
import { getChatWithMessages, findOrCreateChat, seedSystemMessage } from '../../utils/db/queries'

const SCHEDULED_CHAT_TITLE = 'Scheduled runs'

// Placeholder instruction — swap for a real recurring workflow once one is
// decided; the mechanism (this file + the nuxt.config.ts cron entry) is the
// deliverable here, not a specific business process.
const WORKFLOW_PROMPT = 'Follow the instructions in ./playground/workflows/overview.md and report a short summary of what you found or did.'

export default defineTask({
  meta: {
    name: 'agent:scheduled-run',
    description: 'Runs a predefined agent workflow unattended and reports into a dedicated chat.'
  },
  async run() {
    // Awaiting the promise (not reading a resolved snapshot) means this is
    // correct even if the task fires before tool-runtime.ts's plugin body
    // has finished — see server/index.d.ts for why a snapshot would race.
    const runtime = await useNitroApp().toolRuntimePromise

    const chat = await findOrCreateChat(SCHEDULED_CHAT_TITLE)
    const existing = await getChatWithMessages(chat.id)

    // Build the message list in memory from the one fetch above plus
    // whatever gets inserted below, instead of re-fetching the chat's full
    // (and, over months of daily runs, ever-growing) history a second time
    // just to pick up two rows we already have local copies of.
    const newRows: typeof existing.messages = []

    // System row is only seeded once per chat, mirroring how POST /api/chats
    // seeds it on creation (same seedSystemMessage helper, so the two can't drift).
    if (!existing.messages.some(m => m.role === 'system')) {
      newRows.push(await seedSystemMessage(chat.id))
    }

    const [userRow] = await db.insert(schema.messages).values({
      chatId: chat.id,
      role: 'user',
      content: formatUserContent(WORKFLOW_PROMPT)
    }).returning()
    newRows.push(userRow!)

    const context = await buildContext([...existing.messages, ...newRows])

    // No live SSE client to answer a confirmation prompt during an unattended
    // run — excluding RISKY_TOOL_NAMES keeps this safe-by-default rather than
    // letting a call stall for withConfirmation's 5-minute timeout and then
    // auto-deny (confirmation-registry.ts).
    const activeToolNames = resolveActiveToolNames(runtime.defaultEnabledToolNames)
      .filter(name => !RISKY_TOOL_NAMES.has(name))

    const model = MODELS[0]!.value

    // runAgentLoopCore never rejects — it catches everything internally (including
    // provider outages / thrown network errors) and always resolves with whatever
    // partial steps completed (see core-loop.ts's own try/catch and its
    // "always ends with a done chunk" test). To still tell "hard failure" apart
    // from "finished but produced nothing", capture the 'error' chunk it would
    // otherwise push to a live SSE client — pushSse is a no-op here since there's
    // no attached client to stream to.
    let capturedErrorMessage: string | undefined
    const result = await runAgentLoopCore(
      (chunk: SseChunk) => {
        if (chunk.type === 'error') capturedErrorMessage = chunk.message
      },
      context,
      runtime.tools,
      activeToolNames,
      model,
      undefined,
      { chatId: chat.id, agentName: 'scheduled' }
    )

    await saveTurn(chat.id, model, result, { sealed: !result.aborted })

    // A run that neither errored nor was aborted can still degrade to an empty or
    // tool-call-only turn with no actual summary text — flag that explicitly
    // instead of letting it look identical to a normal successful run.
    const degraded = !capturedErrorMessage && !producedAssistantText(result.messages)

    if (capturedErrorMessage) {
      await flagIssue(chat.id, `Scheduled run failed before producing a response: ${capturedErrorMessage}`)
    } else if (degraded) {
      await flagIssue(chat.id, 'Scheduled run completed without producing any summary text — likely a degraded or incomplete response.')
    }

    // Surfaces in the sidebar (see server/api/chats.get.ts, app/layouts/default.vue)
    // so the user doesn't have to open this chat just to discover a run happened —
    // cleared the next time it's actually opened (server/api/chats/[id].get.ts).
    await db.update(schema.chats).set({ needsAttention: true }).where(eq(schema.chats.id, chat.id))

    return { result: capturedErrorMessage ? 'error' : degraded ? 'degraded' : 'ok' }
  }
})

async function flagIssue(chatId: string, message: string): Promise<void> {
  console.error(`[agent:scheduled-run] ${message}`)
  await db.insert(schema.messages).values({ chatId, role: 'system', content: message })
}
