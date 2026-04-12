import OpenAI from 'openai'
import Instructor from '@instructor-ai/instructor'
import type { ZodObject, ZodRawShape } from 'zod'
import { z } from 'zod'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

export function createOpenRouter() {
  return new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY ?? ''
  })
}

export async function structuredChat<S extends ZodObject<ZodRawShape>>(
  messages: ChatCompletionMessageParam[],
  schema: S,
  model: string
): Promise<z.infer<S>> {
  const client = createOpenRouter()
  const instructor = Instructor({ client, mode: 'TOOLS' })
  return instructor.chat.completions.create({
    model,
    messages,
    response_model: { schema, name: schema.description ?? 'Response' }
  })
}

export async function analyzeImageStructured<S extends ZodObject<ZodRawShape>>(
  imageDataUrl: string,
  prompt: string,
  schema: S,
  model: string
): Promise<z.infer<S>> {
  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: prompt }
      ]
    }
  ]
  return structuredChat(messages, schema, model)
}
