import { createEventStream } from 'h3'
import { runAgentLoopCore } from './core-loop'
import { resolveActiveToolNames } from './tool-selection'

export function runStreamingAgentLoop(options: StreamingAgentLoopOptions) {
  const eventStream = createEventStream(options.event)
  const runtime = options.event.context.$toolRuntime
  const abortController = new AbortController()
  // `req` ('close' on IncomingMessage), not `res`, looks like the natural choice —
  // but once the request body has been read (readValidatedBody, always true here),
  // 'close' on `req` no longer fires when the client disconnects mid-stream. `res`
  // ('close' on ServerResponse) does fire reliably in that case — verified against
  // a raw h3 server with a killed client. Without this, a dropped connection never
  // aborts the loop: the turn just runs to completion in the background.
  options.event.node.res.on('close', () => {
    console.log('Client disconnected, aborting agent loop')
    abortController.abort()
  })

  async function runProcessing() {
    try {
      const activeToolNames = resolveActiveToolNames(runtime.defaultEnabledToolNames, options.allowTools)

      const result = await runAgentLoopCore(
        chunk => eventStream.push(JSON.stringify(chunk)),
        options.context,
        runtime.tools,
        activeToolNames,
        options.model,
        abortController.signal,
        { chatId: options.chatId, agentName: 'main' }
      )

      // Always persist, aborted or not — result.aborted tells onCompleted
      // whether to mark what it saves as sealed (see persist.ts). A dropped
      // connection or a user hitting Stop mid-turn shouldn't discard
      // already-completed steps, only skip whatever hadn't finished yet.
      await options.onCompleted?.(result, chunk => eventStream.push(JSON.stringify(chunk)))
    } catch (err: unknown) {
      // Always log — even aborted, e.g. onCompleted's saveTurn failing while
      // persisting partial progress must not fail silently just because the
      // client is already gone. Only the SSE push (pointless with no listener)
      // stays conditional on the connection still being live.
      console.error('[agent] Error in agent loop', err)
      if (!abortController.signal.aborted) {
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
