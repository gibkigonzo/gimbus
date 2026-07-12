import { MODELS } from '#shared/utils/models'

export function useModels() {
  const model = useCookie<string>('model', { default: () => 'openai/gpt-4o-mini' })

  return {
    models: MODELS,
    model
  }
}
