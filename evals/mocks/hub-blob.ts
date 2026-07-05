/**
 * Stub for the `hub:blob` virtual module (only resolvable inside Nuxt/NuxtHub's Nitro build).
 * Running evals outside Nitro needs a stand-in; `get()` returning null mirrors real "not found"
 * behavior the tools already handle gracefully — fine for a tool-*selection* eval, which never
 * asserts on tool output, only on which tool got called.
 */
export const blob = {
  async get() {
    return null
  },
  async put(pathname: string) {
    return { pathname }
  }
}
