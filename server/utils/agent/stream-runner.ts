import { createEventStream } from 'h3'
import { runAgentLoopCore } from './core-loop'
import { resolveToolsByAllowList } from './tool-selection'

export function runStreamingAgentLoop(options: StreamingAgentLoopOptions) {
  const eventStream = createEventStream(options.event)
  const runtime = options.event.context.$toolRuntime
  const abortController = new AbortController()
  options.event.node.req.on('close', () => {
    console.log('Client disconnected, aborting agent loop')
    abortController.abort()
  })

  async function runProcessing() {
    try {
      const { tools, handlers } = resolveToolsByAllowList(
        runtime.tools,
        runtime.handlers,
        runtime.defaultEnabledToolNames,
        options.allowTools
      )

      const result = await runAgentLoopCore(
        chunk => eventStream.push(JSON.stringify(chunk)),
        options.context,
        tools,
        handlers,
        options.model,
        abortController.signal
      )

      if (!abortController.signal.aborted) {
        await options.onCompleted?.(result)
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
