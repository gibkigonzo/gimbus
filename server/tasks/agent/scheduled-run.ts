import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { MODELS } from '#shared/utils/models'
import { RISKY_TOOL_NAMES } from '../../utils/tool-runtime/build'
import { resolveActiveToolNames } from '../../utils/agent/tool-selection'
import { runAgentLoopCore } from '../../utils/agent/core-loop'
import { saveTurn } from '../../utils/agent/persist'
import { buildContext } from '../../utils/agent/context'
import { formatUserContent } from '../../utils/agent/history'
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

    const result = await runAgentLoopCore(
      () => {},
      context,
      runtime.tools,
      activeToolNames,
      model,
      undefined,
      { chatId: chat.id, agentName: 'scheduled' }
    )

    await saveTurn(chat.id, model, result, { sealed: !result.aborted })

    // Surfaces in the sidebar (see server/api/chats.get.ts, app/layouts/default.vue)
    // so the user doesn't have to open this chat just to discover a run happened —
    // cleared the next time it's actually opened (server/api/chats/[id].get.ts).
    await db.update(schema.chats).set({ needsAttention: true }).where(eq(schema.chats.id, chat.id))

    return { result: 'ok' }
  }
})
