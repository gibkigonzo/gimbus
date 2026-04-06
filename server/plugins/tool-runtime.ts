export default defineNitroPlugin(async (nitroApp) => {
    try {
        const container = await buildToolRuntimeState()
        const unregister = nitroApp.hooks.hook("request", (event) => {
            if (event.context.$toolRuntime || !event.path.startsWith('/api/')) {
                return
            }

            console.log('[tool-runtime] Attaching runtime to request context', event.path)
            event.context.$toolRuntime = container
        });

        nitroApp.hooks.hook('close', async () => {
            unregister();
            await container.close().catch((err) => {
                console.error('[tool-runtime] Failed to shutdown MCP runtime', err)
                nitroApp.captureError(err as Error, { tags: ['shutdown', 'tool-runtime'] })
            })
        })
    } catch (err) {
        console.error('[tool-runtime] Failed to startup MCP runtime', err)
        nitroApp.captureError(err as Error, { tags: ['startup', 'tool-runtime'] })
    }
})
