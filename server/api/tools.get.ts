export default defineEventHandler(async (event) => {
  const runtime = event.context.$toolRuntime
  if (!runtime) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Runtime narzedzi nie jest gotowy'
    })
  }

  return {
    tools: runtime.catalog,
    defaultEnabledToolNames: runtime.defaultEnabledToolNames
  }
})
