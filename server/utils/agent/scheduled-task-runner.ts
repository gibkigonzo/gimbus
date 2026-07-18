import { db, schema } from 'hub:db'
import { eq } from 'drizzle-orm'
import { MODELS } from '#shared/utils/models'
import type { SseChunk, AgentLoopResult } from '#shared/types/agent-runtime'
import { resolveActiveToolNames } from './tool-selection'
import { RISKY_TOOL_NAMES } from '../tool-runtime/build'
import { runAgentLoopCore } from './core-loop'
import { saveTurn } from './persist'
import { buildContext } from './context'
import { formatUserContent } from './history'
import { producedAssistantText } from './run-outcome'
import { acquireLock, releaseLock } from './run-lock'
import { trackAndMaybeReviewValue } from './scheduled-task-review'
import { isToolDegraded } from '../observability/sinks/lessons-sink'
import { getChatWithMessages, findOrCreateChat, seedSystemMessage } from '../db/queries'
import type { ScheduledTaskDefinition } from './scheduled-task-definitions'
import type { ToolRuntimeState } from '#shared/types/tool-runtime'

const MODEL = MODELS[0]!.value
const RECENT_SUMMARY_COUNT = 5

// The nitro cron entry (nuxt.config.ts's nitro.scheduledTasks) fires on the
// process's local time — croner is given no `timezone` option there, so
// "8am" only means the intended timezone if the process itself has TZ set
// (see .env.example's TZ=Europe/Warsaw, the single source of truth for the
// actual value). This turns a silent timezone drift into a visible log line.
function warnIfTimezoneUnset(taskLabel: string): void {
  if (!process.env.TZ) {
    console.warn(`[${taskLabel}] process TZ is unset — the cron schedule fires on server-local time, which may not match the intended timezone. Set TZ in .env (see .env.example).`)
  }
}

/**
 * Runs one named scheduled task definition unattended and reports into its
 * own chat. Shared by every task file under server/tasks/agent/scheduled/ —
 * each task file just resolves its own ScheduledTaskDefinition, awaits
 * useNitroApp().toolRuntimePromise itself, and calls this, so adding a new
 * independent background task never means copy-pasting this orchestration.
 *
 * `runtime` is threaded in as a parameter rather than this function calling
 * useNitroApp() itself: vue-tsc's project-reference build mode (`-b`, what
 * `nuxt typecheck` runs) loses server/index.d.ts's NitroApp.toolRuntimePromise
 * module augmentation specifically when a server/tasks/** (defineTask) file
 * imports a *different* file that calls useNitroApp() — confirmed via a
 * minimal repro. Calling it directly inside the defineTask file (where the
 * old single-file scheduled-run.ts always did) avoids the cross-file case
 * entirely.
 */
export async function runScheduledTask(definition: ScheduledTaskDefinition, runtime: ToolRuntimeState) {
  const taskLabel = `agent:scheduled:${definition.key}`
  warnIfTimezoneUnset(taskLabel)

  // Keyed per-definition so two different scheduled tasks can run concurrently —
  // only overlapping runs of the SAME task are prevented.
  const lock = acquireLock(taskLabel)
  if (!lock.acquired) {
    return await reportSkippedRun(definition, taskLabel)
  }

  try {
    return await runDefinition(definition, taskLabel, runtime)
  } finally {
    releaseLock(taskLabel)
  }
}

async function reportSkippedRun(definition: ScheduledTaskDefinition, taskLabel: string) {
  const message = `Scheduled run skipped: a previous run of '${definition.key}' is still in progress.`
  const chat = await findOrCreateChat(definition.chatTitle)
  await flagIssue(taskLabel, chat.id, message)
  await db.update(schema.chats).set({ needsAttention: true }).where(eq(schema.chats.id, chat.id))
  return { result: 'skipped-locked' }
}

async function runDefinition(definition: ScheduledTaskDefinition, taskLabel: string, runtime: ToolRuntimeState) {
  const chat = await findOrCreateChat(definition.chatTitle)
  const existing = await getChatWithMessages(chat.id)

  // Still true at the start of this run means the previous run's flag was
  // never cleared by the user actually opening the chat — the free signal
  // scheduled-task-review.ts's self-review heuristic is gated on.
  const wasOpenedSinceLastRun = !chat.needsAttention

  const newRows: typeof existing.messages = []

  if (!existing.messages.some(m => m.role === 'system')) {
    newRows.push(await seedSystemMessage(chat.id, definition.systemPrompt))
  }

  const [userRow] = await db.insert(schema.messages).values({
    chatId: chat.id,
    role: 'user',
    content: formatUserContent(definition.workflowPrompt)
  }).returning()
  newRows.push(userRow!)

  const context = await buildContext([...existing.messages, ...newRows])

  // No live SSE client to answer a confirmation prompt during an unattended
  // run — defaultSubAgentToolNames is already risk-filtered (build.ts), same
  // resolution shape delegate.ts uses for its own sub-agents. Re-filtering
  // RISKY_TOOL_NAMES here too (unlike delegate.ts) because, unlike a
  // sub-agent's allowTools, a ScheduledTaskDefinition's allowToolNames fully
  // REPLACES the risk-filtered default (resolveActiveToolNames' `??`) rather
  // than adding to it — an unattended run must never end up with a
  // confirmation-gated tool active, since there is no human to answer the
  // prompt and it would silently stall for withConfirmation's 5-minute
  // timeout and then auto-deny instead of erroring loudly.
  const activeToolNames = resolveActiveToolNames(runtime.defaultSubAgentToolNames, definition.allowToolNames)
    .filter(name => !RISKY_TOOL_NAMES.has(name))

  let capturedErrorMessage: string | undefined
  const result = await runAgentLoopCore(
    (chunk: SseChunk) => {
      if (chunk.type === 'error') capturedErrorMessage = chunk.message
    },
    context,
    runtime.tools,
    activeToolNames,
    MODEL,
    undefined,
    { chatId: chat.id, agentName: `scheduled:${definition.key}` }
  )

  await saveTurn(chat.id, MODEL, result, { sealed: !result.aborted })

  const degraded = !capturedErrorMessage && !producedAssistantText(result.messages)

  if (capturedErrorMessage || degraded) {
    const suffix = await describeDegradedTools(result.messages)
    if (capturedErrorMessage) {
      await flagIssue(taskLabel, chat.id, `Scheduled run failed before producing a response: ${capturedErrorMessage}.${suffix}`)
    } else {
      await flagIssue(taskLabel, chat.id, `Scheduled run completed without producing any summary text — likely a degraded or incomplete response.${suffix}`)
    }
  } else {
    const recentSummaries = existing.messages
      .filter((m): m is typeof m & { content: string } => m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().length > 0)
      .slice(-RECENT_SUMMARY_COUNT)
      .map(m => m.content.slice(0, 300))

    const reviewNote = await trackAndMaybeReviewValue(definition, wasOpenedSinceLastRun, recentSummaries, MODEL, chat.id)
    if (reviewNote) {
      await flagIssue(taskLabel, chat.id, reviewNote)
    }
  }

  // Surfaces in the sidebar regardless of outcome — cleared the next time the
  // chat is actually opened (server/api/chats/[id]/seen.post.ts).
  await db.update(schema.chats).set({ needsAttention: true }).where(eq(schema.chats.id, chat.id))

  return { result: capturedErrorMessage ? 'error' : degraded ? 'degraded' : 'ok' }
}

/** Cross-references tool names called this turn against isToolDegraded() to
 * name the likely culprit in a failed/degraded run's flag message, rather
 * than leaving "something went wrong" with no lead on what to check. */
async function describeDegradedTools(messages: AgentLoopResult['messages']): Promise<string> {
  const calledToolNames = new Set(
    messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => m.tool_calls ?? [])
      .map(tc => tc.function.name)
  )

  const degradedNames = (await Promise.all(
    Array.from(calledToolNames).map(async name => (await isToolDegraded(name)) ? name : null)
  )).filter((name): name is string => name !== null)

  if (degradedNames.length === 0) return ''
  return ` Tool(s) ${degradedNames.join(', ')} have failed repeatedly — their external source may be down.`
}

async function flagIssue(taskLabel: string, chatId: string, message: string): Promise<void> {
  console.error(`[${taskLabel}] ${message}`)
  await db.insert(schema.messages).values({ chatId, role: 'system', content: message })
}
