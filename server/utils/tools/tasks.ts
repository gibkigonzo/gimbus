import { createHash } from 'node:crypto'
import { tool } from 'ai'
import { z } from 'zod'

interface Task {
  id: number
  description: string
  status: 'pending' | 'done'
  result?: string
  createdAt: string
  chatId: string
  context?: string
}

interface TaskStore {
  version: string
  tasks: Task[]
  updatedAt: string
}

const STORAGE_PREFIX = 'tasks'

function computeVersion(tasks: Task[]): string {
  return createHash('sha256').update(JSON.stringify(tasks)).digest('hex').slice(0, 8)
}

async function getTaskStore(sessionId: string): Promise<TaskStore> {
  const stored = await useStorage(STORAGE_PREFIX).getItem<TaskStore>(sessionId)
  if (stored && typeof stored === 'object' && 'version' in stored && 'tasks' in stored) {
    return stored
  }
  // Legacy or missing: initialize empty store
  const tasks: Task[] = []
  return { version: computeVersion(tasks), tasks, updatedAt: '' }
}

type SetResult
  = | { conflict: false }
    | { conflict: true, currentStore: TaskStore }

async function setTaskStore(sessionId: string, newTasks: Task[], expectedVersion: string): Promise<SetResult> {
  const current = await getTaskStore(sessionId)
  if (current.version !== expectedVersion) {
    return { conflict: true, currentStore: current }
  }
  const store: TaskStore = {
    version: computeVersion(newTasks),
    tasks: newTasks,
    updatedAt: new Date().toISOString()
  }
  await useStorage(STORAGE_PREFIX).setItem(sessionId, store)
  return { conflict: false }
}

const argsSchema = z.object({
  session_id: z.string().describe('Your chat session identifier (from context)'),
  operation: z.enum(['list', 'add', 'complete', 'remove'])
    .describe('"list" — show all tasks; "add" — add a new task; "complete" — mark a task done; "remove" — remove a task'),
  task: z.string().optional().describe('Task description (required for "add")'),
  task_id: z.number().optional().describe('Task ID (required for "complete" and "remove")'),
  result: z.string().optional().describe('Outcome of the completed task — what was created, found, or verified (required for "complete"). Be specific: include file paths, found values, or check results.'),
  context: z.string().optional().describe('Short description of what you are currently working on (optional, used with "add"). Helps reconstruct provenance when resuming old sessions.')
})

export const manageTasksTool = tool({
  description:
    'Manage your session task list. Call with operation="list" at the start of every turn to review your current plan. When completing a task, always provide a "result" summarising the outcome (files created, information found, verification results, etc.) so the same work is never repeated. You may only have one pending task at a time — complete the current task before adding the next one. Always returns the full current list.',
  inputSchema: argsSchema,
  execute: async (args) => {
    const sessionId = args.session_id
    const operation = args.operation

    const store = await getTaskStore(sessionId)
    const tasks = store.tasks

    if (operation === 'list') {
      return { tasks }
    }

    if (operation === 'add') {
      const description = (args.task ?? '').trim()
      if (!description) return { error: '"task" is required for add' }
      const pending = tasks.filter(t => t.status === 'pending')
      if (pending.length > 0) {
        return { error: `Complete the current pending task (id=${pending[0]!.id}: "${pending[0]!.description}") before adding a new one.`, tasks }
      }
      const id = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1
      const context = args.context?.trim()
      const newTasks = [...tasks, { id, description, status: 'pending' as const, createdAt: new Date().toISOString(), chatId: sessionId, context }]
      const writeResult = await setTaskStore(sessionId, newTasks, store.version)
      if (writeResult.conflict) {
        return { error: 'Conflict: task list was concurrently modified. Re-list and retry.', tasks: writeResult.currentStore.tasks }
      }
      return { tasks: newTasks }
    }

    if (operation === 'complete') {
      const taskId = Number(args.task_id)
      const newTasks = tasks.map((t) => {
        if (t.id !== taskId) return t
        const result = args.result?.trim()
        return { ...t, status: 'done' as const, ...(result ? { result } : {}) }
      })
      if (!tasks.some(t => t.id === taskId)) return { error: `Task ${taskId} not found` }
      const writeResult = await setTaskStore(sessionId, newTasks, store.version)
      if (writeResult.conflict) {
        return { error: 'Conflict: task list was concurrently modified. Re-list and retry.', tasks: writeResult.currentStore.tasks }
      }
      return { tasks: newTasks }
    }

    if (operation === 'remove') {
      const taskId = Number(args.task_id)
      if (!tasks.some(t => t.id === taskId)) return { error: `Task ${taskId} not found` }
      const newTasks = tasks.filter(t => t.id !== taskId)
      const writeResult = await setTaskStore(sessionId, newTasks, store.version)
      if (writeResult.conflict) {
        return { error: 'Conflict: task list was concurrently modified. Re-list and retry.', tasks: writeResult.currentStore.tasks }
      }
      return { tasks: newTasks }
    }

    return { error: `Unknown operation: ${operation}` }
  }
})
