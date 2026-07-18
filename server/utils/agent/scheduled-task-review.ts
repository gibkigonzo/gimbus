import { z } from 'zod'
import { structuredChat } from '../openrouter'
import { getScheduledTaskUnopenedCount, setScheduledTaskUnopenedCount } from '../db/queries'
import type { ScheduledTaskDefinition } from './scheduled-task-definitions'

// Only spend an LLM-judge call once every this-many consecutive un-opened runs,
// not every run — the cheap free signal (chats.needsAttention still true) gates
// the expensive one (an actual value judgment over recent output).
const UNOPENED_THRESHOLD = 3

const reviewSchema = z.object({
  stillValuable: z.boolean(),
  reason: z.string().max(200)
}).describe('ScheduledTaskValueReview')

/**
 * Tracks whether a scheduled task's output is actually being looked at, and
 * periodically asks an LLM judge whether a recurring task that keeps going
 * unopened is still worth running — catching the failure mode run-outcome.ts
 * can't see: a run that finishes cleanly every time but nobody reads.
 *
 * wasOpenedSinceLastRun should be computed from chats.needsAttention BEFORE
 * the current run sets it back to true — still true at the start of a new run
 * means the previous run's output was never opened.
 *
 * Returns a human-readable flag note when the judge concludes the task is no
 * longer valuable, or null otherwise (including on judge failure — mirrors
 * title.ts's "never throw upward" convention for a non-critical LLM call).
 */
export async function trackAndMaybeReviewValue(
  definition: ScheduledTaskDefinition,
  wasOpenedSinceLastRun: boolean,
  recentAssistantSummaries: string[],
  model: string,
  chatId: string
): Promise<string | null> {
  if (wasOpenedSinceLastRun) {
    if (await getScheduledTaskUnopenedCount(definition.key) !== 0) {
      await setScheduledTaskUnopenedCount(definition.key, 0)
    }
    return null
  }

  const consecutiveUnopened = (await getScheduledTaskUnopenedCount(definition.key)) + 1
  await setScheduledTaskUnopenedCount(definition.key, consecutiveUnopened)

  if (consecutiveUnopened % UNOPENED_THRESHOLD !== 0) return null
  if (recentAssistantSummaries.length === 0) return null

  try {
    const { stillValuable, reason } = await structuredChat(
      [{
        role: 'user',
        content: `A recurring background task ("${definition.key}") has produced the following recent summaries, and its output has not been opened/read for ${consecutiveUnopened} consecutive runs in a row:\n\n${recentAssistantSummaries.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nBased on this, is this task still likely providing value to the user, or should it be reduced in frequency / disabled? Answer concisely.`
      }],
      reviewSchema,
      model,
      'ScheduledTaskValueReview',
      { chatId, agentName: `scheduled-review:${definition.key}` }
    )
    if (stillValuable) return null
    return `Self-review: this task hasn't been opened in ${consecutiveUnopened} consecutive runs and may no longer be useful — ${reason}`
  } catch (err) {
    console.error(`[scheduled-task-review] review failed for '${definition.key}':`, err)
    return null
  }
}
