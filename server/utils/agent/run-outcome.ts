import type { AgentLoopResult } from '#shared/types/agent-runtime'

/**
 * Cheap floor check for whether a completed turn actually produced a real
 * final reply — used by scheduled-run.ts to catch a run that finished without
 * throwing but degraded to empty/whitespace-only output. Looks only at the
 * LAST assistant step, not any step in the turn: with stopWhen: stepCountIs(60),
 * an early step can carry incidental preamble text alongside a tool call (e.g.
 * "Let me check that file") while the run then exhausts its step budget
 * without ever emitting the actual final summary — checking "any" step would
 * miss that as a false negative for "degraded".
 */
export function producedAssistantText(messages: AgentLoopResult['messages']): boolean {
  const lastAssistant = messages.findLast(m => m.role === 'assistant')
  return typeof lastAssistant?.content === 'string' && lastAssistant.content.trim().length > 0
}
