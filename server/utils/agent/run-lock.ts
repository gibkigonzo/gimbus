const activeLocks = new Set<string>()

export type AcquireLockResult
  = | { acquired: true }
    | { acquired: false }

/**
 * Single-process reentrancy guard for a Nitro scheduled task, preventing two
 * overlapping invocations from both proceeding (e.g. both inserting rows
 * into the same chat). Deliberately synchronous — check and set happen in
 * the same tick with no `await` between them, so there's no window for two
 * near-simultaneous calls to both observe "unlocked". A Promise-returning,
 * useStorage-backed version was tried first, but its getItem-then-setItem
 * had exactly that race, and Nitro's own runTask() (nitropack's task.mjs)
 * already keeps `__runningTasks__[name]` set for an in-flight task's full
 * lifetime — this guard exists mainly to make a skip loud (a log line, and
 * in scheduled-task-runner.ts's case a flagged chat message) where Nitro's own dedup
 * is silent, not to invent a second locking mechanism from scratch.
 *
 * No TTL/staleness recovery: this process is long-lived and in-process
 * (nuxt.config.ts's croner-based scheduler, not a fresh process per run), so
 * a crash clears `activeLocks` for free on restart, and a lock still held
 * because the run is genuinely hung has no separate "stale" state to expire
 * into — it should stay held until that run actually finishes.
 */
export function acquireLock(key: string): AcquireLockResult {
  if (activeLocks.has(key)) {
    return { acquired: false }
  }
  activeLocks.add(key)
  return { acquired: true }
}

export function releaseLock(key: string): void {
  activeLocks.delete(key)
}
