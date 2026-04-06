import { z } from 'zod'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { structuredChat } from '../openrouter'

const OBSERVER_MODEL = 'openai/gpt-4o-mini'
const REFLECTOR_LOG_CHAR_THRESHOLD = 240_000 // proxy for ~60k tokens at 4 chars/token

const logSchema = z.object({ log: z.string() }).describe('MemoryLog')

const OBSERVER_SYSTEM_PROMPT = `You are a memory observer for an AI assistant conversation.
Your job is to maintain a concise running log of the conversation — the key facts, decisions, user preferences, context, and outcomes.

Rules:
- Each entry is one line: [YYYY-MM-DD HH:MM] <component/topic>: <concise fact or decision>
- Preserve existing entries unless they are directly superseded by newer information
- Add new entries for anything significant from the recent messages: decisions made, files modified, tasks completed, user preferences expressed, important outputs
- Omit small talk, simple greetings, and trivial exchanges
- Keep the log as short as possible while preserving all actionable context
- Do not summarize entire conversations into prose — keep discrete factual entries`

const REFLECTOR_SYSTEM_PROMPT = `You are a memory reflector for an AI assistant conversation log.
The log has grown too long and must be compressed.

Rules:
- Merge entries covering the same topic or component into a single up-to-date entry
- Remove entries that are clearly outdated or superseded by later entries
- Keep the most recent state of any given fact, not its history
- Preserve all entries that represent unique, still-relevant context
- Output format: one line per entry: [YYYY-MM-DD HH:MM] <component/topic>: <concise fact>
- The output must be significantly shorter than the input`

/**
 * Runs the Observer: ingests recent conversation messages and updates the memory log.
 * If the resulting log exceeds the size threshold, the Reflector is called automatically.
 */
export async function runObserver(
  currentLog: string | null,
  recentMessages: ChatCompletionMessageParam[]
): Promise<string> {
  const logSection = currentLog
    ? `<current_log>\n${currentLog}\n</current_log>\n\n`
    : ''

  const messagesText = recentMessages
    .filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
    .map((m) => {
      const role = m.role.toUpperCase()
      const content = typeof m.content === 'string'
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map(p => (p.type === 'text' ? p.text : '[non-text content]')).join(' ')
          : ''
      return `[${role}]: ${content}`
    })
    .join('\n\n')

  const userContent = `${logSection}<recent_messages>\n${messagesText}\n</recent_messages>`

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: OBSERVER_SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ]

  const { log: newLog } = await structuredChat(messages, logSchema, OBSERVER_MODEL)

  if (newLog.length > REFLECTOR_LOG_CHAR_THRESHOLD) {
    return runReflector(newLog)
  }

  return newLog
}

/**
 * Runs the Reflector: compresses an oversized memory log into a shorter one.
 */
export async function runReflector(currentLog: string): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: REFLECTOR_SYSTEM_PROMPT },
    { role: 'user', content: currentLog }
  ]

  const { log } = await structuredChat(messages, logSchema, OBSERVER_MODEL)
  return log
}
