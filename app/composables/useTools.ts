export interface ToolCatalogItem {
  name: string
  description: string
  sourceType: 'builtin' | 'mcp'
  sourceName: string
  enabledByDefault: boolean
}

interface ToolsCatalogResponse {
  tools: ToolCatalogItem[]
  defaultEnabledToolNames: string[]
}

export function useTools() {
  const tools = useState<ToolCatalogItem[]>('tools-catalog', () => [])
  const defaultEnabledToolNames = useState<string[]>('tools-default-enabled', () => [])
  const isLoaded = useState<boolean>('tools-loaded', () => false)
  const isLoading = useState<boolean>('tools-loading', () => false)

  const selectedToolNames = useCookie<string[]>('allowTools', { default: () => [] })
  const selectedInitialized = useCookie<boolean>('allowToolsInitialized', { default: () => false })
  const knownToolNames = useCookie<string[]>('knownToolNames', { default: () => [] })

  async function ensureLoaded() {
    if (isLoaded.value || isLoading.value) return

    isLoading.value = true
    try {
      const data = await $fetch<ToolsCatalogResponse>('/api/tools')
      tools.value = data.tools
      defaultEnabledToolNames.value = data.defaultEnabledToolNames

      const validNames = new Set(data.tools.map(tool => tool.name))

      if (!selectedInitialized.value) {
        selectedToolNames.value = data.defaultEnabledToolNames.filter(name => validNames.has(name))
        selectedInitialized.value = true
      } else {
        // A tool the server now marks enabledByDefault but this browser has
        // never seen before (added after this cookie was first initialized)
        // is unioned in — otherwise a newly-added default-on tool would never
        // reach a returning user, who'd have to find and toggle it manually.
        const knownNames = new Set(knownToolNames.value)
        const newlyAddedDefaults = data.defaultEnabledToolNames.filter(name => validNames.has(name) && !knownNames.has(name))
        selectedToolNames.value = [
          ...selectedToolNames.value.filter(name => validNames.has(name)),
          ...newlyAddedDefaults
        ]
      }

      knownToolNames.value = data.tools.map(tool => tool.name)
      isLoaded.value = true
    } finally {
      isLoading.value = false
    }
  }

  return {
    tools,
    defaultEnabledToolNames,
    selectedToolNames,
    isLoaded,
    isLoading,
    ensureLoaded
  }
}
