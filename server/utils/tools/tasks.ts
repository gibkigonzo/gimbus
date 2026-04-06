import type { ChatCompletionTool } from 'openai/resources/chat/completions'

interface Task {
  id: number
  description: string
  status: 'pending' | 'done'
}

const STORAGE_PREFIX = 'tasks'

async function getTasks(sessionId: string): Promise<Task[]> {
  return (await useStorage(STORAGE_PREFIX).getItem<Task[]>(sessionId)) ?? []
}

async function setTasks(sessionId: string, tasks: Task[]): Promise<void> {
  await useStorage(STORAGE_PREFIX).setItem(sessionId, tasks)
}

export const manageTasksTool: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'manage_tasks',
    description:
      'Manage your session task list. Call with operation="list" at the start of every turn to review your current plan. Update tasks as you make progress. Always returns the full current list.',
    parameters: {
      type: 'object',
      properties: {
        session_id: {
          type: 'string',
          description: 'Your chat session identifier (from context)'
        },
        operation: {
          type: 'string',
          enum: ['list', 'add', 'complete', 'remove'],
          description: '"list" — show all tasks; "add" — add a new task; "complete" — mark a task done; "remove" — remove a task'
        },
        task: {
          type: 'string',
          description: 'Task description (required for "add")'
        },
        task_id: {
          type: 'number',
          description: 'Task ID (required for "complete" and "remove")'
        }
      },
      required: ['session_id', 'operation']
    }
  }
}

export async function handleManageTasks(args: Record<string, unknown>): Promise<unknown> {
  const sessionId = String(args.session_id ?? '')
  const operation = String(args.operation ?? 'list')

  const tasks = await getTasks(sessionId)

  if (operation === 'list') {
    return { tasks }
  }

  if (operation === 'add') {
    const description = String(args.task ?? '').trim()
    if (!description) return { error: '"task" is required for add' }
    const id = tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1
    tasks.push({ id, description, status: 'pending' })
    await setTasks(sessionId, tasks)
    return { tasks }
  }

  if (operation === 'complete') {
    const taskId = Number(args.task_id)
    const task = tasks.find(t => t.id === taskId)
    if (!task) return { error: `Task ${taskId} not found` }
    task.status = 'done'
    await setTasks(sessionId, tasks)
    return { tasks }
  }

  if (operation === 'remove') {
    const taskId = Number(args.task_id)
    const idx = tasks.findIndex(t => t.id === taskId)
    if (idx === -1) return { error: `Task ${taskId} not found` }
    tasks.splice(idx, 1)
    await setTasks(sessionId, tasks)
    return { tasks }
  }

  return { error: `Unknown operation: ${operation}` }
}
