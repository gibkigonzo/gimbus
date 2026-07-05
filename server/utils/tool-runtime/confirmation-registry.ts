/**
 * In-process coordination for pausing a risky tool call mid-turn until a
 * human responds. Mirrors the module-level async-coordination pattern already
 * used for the (now-removed) hub-shell exec lock — ephemeral, single-process
 * runtime state, not a candidate for useStorage/DB persistence.
 */
const pending = new Map<string, (approved: boolean) => void>()

const DEFAULT_TIMEOUT_MS = 5 * 60_000

export function waitForConfirmation(confirmationId: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(confirmationId)
      resolve(false)
    }, timeoutMs)

    pending.set(confirmationId, (approved) => {
      clearTimeout(timer)
      pending.delete(confirmationId)
      resolve(approved)
    })
  })
}

export function resolveConfirmation(confirmationId: string, approved: boolean): boolean {
  const resolve = pending.get(confirmationId)
  if (!resolve) return false
  resolve(approved)
  return true
}
