import { describe, it, expect, vi, beforeEach } from 'vitest'

const cookieStore = new Map<string, { value: unknown }>()
const stateStore = new Map<string, { value: unknown }>()

vi.stubGlobal('useCookie', <T>(key: string, opts: { default: () => T }) => {
  if (!cookieStore.has(key)) cookieStore.set(key, { value: opts.default() })
  return cookieStore.get(key)!
})

vi.stubGlobal('useState', <T>(key: string, init: () => T) => {
  if (!stateStore.has(key)) stateStore.set(key, { value: init() })
  return stateStore.get(key)!
})

const fetchMock = vi.fn()
vi.stubGlobal('$fetch', (...args: unknown[]) => fetchMock(...args))

const { useTools } = await import('./useTools')

describe('useTools', () => {
  beforeEach(() => {
    cookieStore.clear()
    stateStore.clear()
    fetchMock.mockReset()
  })

  it('seeds selectedToolNames from server defaults on first-ever load', async () => {
    fetchMock.mockResolvedValue({
      tools: [{ name: 'manage_tasks', description: '', sourceType: 'builtin', sourceName: 'built-in', enabledByDefault: true }],
      defaultEnabledToolNames: ['manage_tasks']
    })

    const { selectedToolNames, ensureLoaded } = useTools()
    await ensureLoaded()

    expect(selectedToolNames.value).toEqual(['manage_tasks'])
  })

  it('adds a newly-added default-enabled tool for a returning user without re-adding a tool they had deliberately disabled', async () => {
    // Simulate a browser that already used the app before `recall` existed:
    // it knows about manage_tasks/grep_files, and previously turned manage_tasks off.
    cookieStore.set('allowToolsInitialized', { value: true })
    cookieStore.set('knownToolNames', { value: ['manage_tasks', 'grep_files'] })
    cookieStore.set('allowTools', { value: ['grep_files'] })

    fetchMock.mockResolvedValue({
      tools: [
        { name: 'manage_tasks', description: '', sourceType: 'builtin', sourceName: 'built-in', enabledByDefault: true },
        { name: 'grep_files', description: '', sourceType: 'builtin', sourceName: 'built-in', enabledByDefault: true },
        { name: 'recall', description: '', sourceType: 'builtin', sourceName: 'built-in', enabledByDefault: true }
      ],
      defaultEnabledToolNames: ['manage_tasks', 'grep_files', 'recall']
    })

    const { selectedToolNames, ensureLoaded } = useTools()
    await ensureLoaded()

    expect(selectedToolNames.value.sort()).toEqual(['grep_files', 'recall'])
  })

  it('drops a selected tool name that no longer exists in the catalog', async () => {
    cookieStore.set('allowToolsInitialized', { value: true })
    cookieStore.set('knownToolNames', { value: ['manage_tasks', 'removed_tool'] })
    cookieStore.set('allowTools', { value: ['manage_tasks', 'removed_tool'] })

    fetchMock.mockResolvedValue({
      tools: [{ name: 'manage_tasks', description: '', sourceType: 'builtin', sourceName: 'built-in', enabledByDefault: true }],
      defaultEnabledToolNames: ['manage_tasks']
    })

    const { selectedToolNames, ensureLoaded } = useTools()
    await ensureLoaded()

    expect(selectedToolNames.value).toEqual(['manage_tasks'])
  })
})
