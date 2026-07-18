import { SYSTEM_PROMPT } from '../prompts'

export interface ScheduledTaskDefinition {
  /** Stable id — used in the lock key, the Nitro task's meta.name, and KV keys for review/degradation state. */
  key: string
  /** Target chat this task reports into (findOrCreateChat). */
  chatTitle: string
  /** Static system prompt seeded once per chat. Deliberately not required to be the main
   * chat SYSTEM_PROMPT — new tasks should bring their own narrow identity so they stay
   * isolated from each other and from the main agent, per the isolation principle. */
  systemPrompt: string
  /** Initial user-turn instruction driving the task each run. */
  workflowPrompt: string
  /** Allowed tool names. Omit to fall back to runtime.defaultSubAgentToolNames
   * (already risk-filtered) — mirrors delegate-agents.ts's AgentDefinition.allowTools. */
  allowToolNames?: string[]
}

/**
 * Registry of named scheduled tasks. Each entry runs fully independently — its own
 * chat, its own system prompt, its own tool scope — so adding a second background
 * task never means two agents implicitly sharing context. To add one: push a
 * definition here, add a thin task file under server/tasks/agent/scheduled/ that
 * calls runScheduledTask(definition), and add one cron line in nuxt.config.ts.
 */
export const SCHEDULED_TASK_DEFINITIONS: ScheduledTaskDefinition[] = [
  {
    key: 'workflow-digest',
    chatTitle: 'Scheduled runs',
    // Reuses the main chat SYSTEM_PROMPT to preserve this task's existing behavior
    // exactly (it predates the registry). A future task doesn't need to do this.
    systemPrompt: SYSTEM_PROMPT,
    workflowPrompt: 'Follow the instructions in ./playground/workflows/overview.md and report a short summary of what you found or did.'
  }
]

export function resolveScheduledTaskDefinition(key: string): ScheduledTaskDefinition | undefined {
  return SCHEDULED_TASK_DEFINITIONS.find(d => d.key === key)
}
