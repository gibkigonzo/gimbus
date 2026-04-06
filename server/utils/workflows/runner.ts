import type { ChatCompletionTool } from 'openai/resources/chat/completions'
import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export interface WorkflowContext {
  workflowId: string
}

export interface WorkflowDefinition<TArgs extends Record<string, unknown> = Record<string, unknown>, TResult = unknown> {
  name: string
  tool: ChatCompletionTool
  handler: (args: TArgs, ctx: WorkflowContext) => Promise<TResult>
}

export interface WorkflowToolResult<TResult = unknown> {
  workflowId: string | undefined
  result: TResult
}

export function createWorkflowHandler<TArgs extends Record<string, unknown>, TResult>(
  def: WorkflowDefinition<TArgs, TResult>
): (args: Record<string, unknown>) => Promise<WorkflowToolResult<TResult>> {
  return async (args: Record<string, unknown>) => {
    const [workflow] = await db.insert(schema.workflows).values({
      name: def.name
    }).returning().catch((err) => {
      console.warn(`[workflow] Failed to persist workflow record for '${def.name}':`, err)
      return [] as typeof schema.workflows.$inferSelect[]
    })

    const ctx: WorkflowContext = { workflowId: workflow?.id ?? '' }

    try {
      const result = await def.handler(args as TArgs, ctx)

      if (workflow) {
        await db.update(schema.workflows)
          .set({ result: JSON.stringify(result), completedAt: new Date() })
          .where(eq(schema.workflows.id, workflow.id))
          .catch(err => console.warn('[workflow] Failed to update workflow result:', err))
      }

      return { workflowId: workflow?.id, result }
    }
    catch (err) {
      if (workflow) {
        await db.update(schema.workflows)
          .set({ result: JSON.stringify({ error: (err as Error).message }), completedAt: new Date() })
          .where(eq(schema.workflows.id, workflow.id))
          .catch(updateErr => console.warn('[workflow] Failed to update workflow error result:', updateErr))
      }
      throw err
    }
  }
}
