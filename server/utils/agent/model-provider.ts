import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const openrouterProvider = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY ?? ''
})

export function getModel(modelId: string) {
  return openrouterProvider(modelId)
}
