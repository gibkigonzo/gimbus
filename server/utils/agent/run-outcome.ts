import type { AgentLoopResult } from '#shared/types/agent-runtime'

// A single "word" longer than this is almost certainly a run-on token
// ("asdkjasldkjalskjdla", a bare URL) rather than a real one-word answer —
// genuine single-word replies ("Warszawa.", "42", "Yes.") are short.
const MAX_SINGLE_WORD_LENGTH = 20

// Bare non-answers a model might emit as a lazy "final" reply after
// finishing tool calls — real content even when short ("Yes.", "42",
// "Warszawa.") must NOT be caught by this, only filler that says nothing.
// Punctuation-stripped, case-insensitive comparison.
const BARE_NON_ANSWERS = new Set(['done', 'ok', 'okay', 'n/a', 'na', 'noted', 'got it', 'sure', 'sure thing'])

function isBareNonAnswer(text: string): boolean {
  return BARE_NON_ANSWERS.has(text.replace(/[.!?]+$/, '').toLowerCase())
}

/**
 * Cheap floor check for whether a completed turn actually produced a real
 * final reply — used by scheduled-task-runner.ts to catch a run that finished without
 * throwing but degraded to empty, whitespace-only, or too-thin-to-be-useful
 * output. Looks only at the LAST assistant step, not any step in the turn:
 * with stopWhen: stepCountIs(60), an early step can carry incidental preamble
 * text alongside a tool call (e.g. "Let me check that file") while the run
 * then exhausts its step budget without ever emitting the actual final
 * summary — checking "any" step would miss that as a false negative for
 * "degraded".
 *
 * Deliberately NOT a minimum word count: a genuinely short but real answer
 * ("Warszawa.", "42") is exactly as valid a final reply as a long one, and
 * penalizing brevity produced false "degraded" flags for tasks whose real
 * output tends to be terse. Instead this only rejects whitespace-only
 * content, a known bare-filler non-answer, or a single run-on token with no
 * spaces at all (almost never a real one-word reply at that length).
 */
export function producedAssistantText(messages: AgentLoopResult['messages']): boolean {
  const lastAssistant = messages.findLast(m => m.role === 'assistant')
  if (typeof lastAssistant?.content !== 'string') return false
  const trimmed = lastAssistant.content.trim()
  if (trimmed.length === 0) return false
  if (isBareNonAnswer(trimmed)) return false
  const words = trimmed.split(/\s+/)
  if (words.length === 1) return trimmed.length <= MAX_SINGLE_WORD_LENGTH
  return true
}
