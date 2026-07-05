import { registerAiSdkBridge } from './ai-sdk-bridge'
import { createConsoleSink } from './sinks/console-sink'
import type { ObservabilitySink } from './types'

/**
 * Called once at server startup. Builds the active sink list and registers the
 * ai-sdk telemetry bridge. To add a backend (e.g. Langfuse), implement
 * ObservabilitySink in a new sinks/*.ts file and push it here behind its own
 * env-var check — no other file needs to change.
 */
export function initObservability() {
  const sinks: ObservabilitySink[] = [createConsoleSink()]
  registerAiSdkBridge(sinks)
}
