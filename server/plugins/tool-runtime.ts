export default defineNitroPlugin((nitroApp) => {
  // Assigned synchronously, before any await — Nitro invokes every plugin's
  // body in a plain loop without awaiting it, so a request or scheduled task
  // can in principle reach this before an async plugin body would have set
  // anything. Storing the Promise itself (not its eventually-resolved value)
  // means any consumer, however early, can just await it and get the same
  // guarantee as code that runs after this function's own await would.
  const containerPromise = buildToolRuntimeState()
  nitroApp.toolRuntimePromise = containerPromise

  containerPromise.then((container) => {
    const unregister = nitroApp.hooks.hook('request', (event) => {
      if (event.context.$toolRuntime || !event.path.startsWith('/api/')) {
        return
      }

      console.log('[tool-runtime] Attaching runtime to request context', event.path)
      event.context.$toolRuntime = container
    })

    nitroApp.hooks.hook('close', async () => {
      unregister()
      await container.close().catch((err) => {
        console.error('[tool-runtime] Failed to shutdown MCP runtime', err)
        nitroApp.captureError(err as Error, { tags: ['shutdown', 'tool-runtime'] })
      })
    })
  }).catch((err) => {
    console.error('[tool-runtime] Failed to startup MCP runtime', err)
    nitroApp.captureError(err as Error, { tags: ['startup', 'tool-runtime'] })
  })
})
