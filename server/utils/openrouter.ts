import { generateText, Output } from 'ai'
import type { ModelMessage } from 'ai'
import type { ZodObject, ZodRawShape, z } from 'zod'
import { getModel } from './agent/model-provider'
import type { AgentGenerationMeta } from './observability/types'

export async function structuredChat<S extends ZodObject<ZodRawShape>>(
  messages: ModelMessage[],
  schema: S,
  model: string,
  schemaName?: string,
  meta?: AgentGenerationMeta
): Promise<z.infer<S>> {
  const result = await generateText({
    model: getModel(model),
    messages,
    output: Output.object({ schema, name: schemaName ?? schema.description ?? 'Response' }),
    experimental_telemetry: { isEnabled: true, metadata: { ...meta } }
  })
  return result.output
}

export async function analyzeImageStructured<S extends ZodObject<ZodRawShape>>(
  imageDataUrl: string,
  prompt: string,
  schema: S,
  model: string,
  meta?: AgentGenerationMeta
): Promise<z.infer<S>> {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image', image: imageDataUrl },
        { type: 'text', text: prompt }
      ]
    }
  ]
  return structuredChat(messages, schema, model, undefined, meta)
}
