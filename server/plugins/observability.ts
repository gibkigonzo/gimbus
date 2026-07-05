import { initObservability } from '../utils/observability'

export default defineNitroPlugin(() => {
  initObservability()
  console.log('[observability] Telemetry bridge registered')
})
