import { createEventStream } from 'h3'
import { runAgentLoopCore } from './core-loop'
import { resolveToolsByAllowList } from './tool-selection'

export function runStreamingAgentLoop(options: StreamingAgentLoopOptions) {
  const eventStream = createEventStream(options.event)
  const runtime = options.event.context.$toolRuntime
  const abortController = new AbortController()
  options.event.node.req.on('close', () => abortController.abort())

  async function runProcessing() {
    const usagePerTurn: (AssistantUsage | null)[] = []

    try {
      const { tools, handlers } = resolveToolsByAllowList(
        runtime.tools,
        runtime.handlers,
        runtime.defaultEnabledToolNames,
        options.allowTools
      )

      const finalMessages = await runAgentLoopCore(
        chunk => eventStream.push(JSON.stringify(chunk)),
        options.initialMessages,
        tools,
        handlers,
        options.model,
        options.maxIterations ?? 15,
        usage => usagePerTurn.push(usage),
        abortController.signal
      )

      if (!abortController.signal.aborted) {
        options.onCompleted?.({
          finalMessages,
          usagePerTurn,
        })
      }
    } catch (err: unknown) {
      if (!abortController.signal.aborted) {
        console.error('[agent] Error in agent loop', err)
        await eventStream.push(JSON.stringify({ type: 'error', message: (err as Error).message })).catch(() => {})
      }
    } finally {
      eventStream.close()
    }
  }
  runProcessing().catch((err) => {
    console.error('[agent] Streaming run failed', err)
  })

  return eventStream.send()
}
