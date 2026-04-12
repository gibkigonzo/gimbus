import type OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import type { LoopMessage, LoopContext } from '#shared/types/agent-runtime'

interface ToolCallDelta {
  id: string
  name: string
  argumentsRaw: string
}

const MAX_ITERATIONS = 60

export async function runAgentLoopCore(
  pushSse: (chunk: SseChunk) => Promise<void> | void,
  context: LoopContext,
  tools: ChatCompletionTool[],
  handlers: Record<string, (args: Record<string, unknown>, model: string) => Promise<unknown>>,
  model: string,
  signal?: AbortSignal
): Promise<AgentLoopResult> {
  const client = createOpenRouter()
  const messages: ChatCompletionMessageParam[] = [...context.messages]

  const usagePerTurn: (AssistantUsage | null)[] = []
  const generatedMessages: LoopMessage[] = []

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (signal?.aborted) break
    let assistantContent = ''
    const toolCallsMap: Record<string, ToolCallDelta> = {}
    let iterationUsage: AssistantUsage | null = null

    const streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      ...(tools.length > 0 ? { tools } : {})
    }

    try {
      const stream = await client.chat.completions.create(streamParams, { signal })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta
        if (delta) {
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = String(tc.index)
              if (!toolCallsMap[idx]) {
                toolCallsMap[idx] = { id: tc.id ?? '', name: tc.function?.name ?? '', argumentsRaw: tc.function?.arguments ?? '' }
              } else {
                toolCallsMap[idx]!.id += tc.id ?? ''
                toolCallsMap[idx]!.name += tc.function?.name ?? ''
                toolCallsMap[idx]!.argumentsRaw += tc.function?.arguments ?? ''
              }
            }
          } else if (delta.content) {
            assistantContent += delta.content
            await pushSse({ type: 'text-delta', text: delta.content })
          }
        }

        if (chunk.usage) {
          const details = chunk.usage.prompt_tokens_details
          iterationUsage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cachedTokens: details?.cached_tokens ?? 0
          }
        }
      }
    } catch (err: unknown) {
      console.error('[agent] Error during streaming completion', err)
      await pushSse({ type: 'error', message: (err as Error).message })
      break
    }

    const toolCalls = Object.values(toolCallsMap)

    if (iterationUsage) {
      await pushSse({ type: 'usage', ...iterationUsage, model })
    }
    usagePerTurn.push(iterationUsage)

    const assistantMessage: LoopMessage = toolCalls.length > 0
      ? {
          role: 'assistant',
          content: assistantContent || null,
          tool_calls: toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.argumentsRaw }
          }))
        }
      : { role: 'assistant', content: assistantContent }

    messages.push(assistantMessage as ChatCompletionMessageParam)
    generatedMessages.push(assistantMessage)

    if (toolCalls.length === 0) {
      break
    }

    const toolResults: LoopMessage[] = await Promise.all(
      toolCalls.map(async (tc) => {
        const handler = handlers[tc.name]
        let result: unknown
        if (!handler) {
          result = { error: `Tool '${tc.name}' not found` }
        } else {
          try {
            console.log(`[agent] Calling tool '${tc.name}' with arguments:`, tc.argumentsRaw)
            result = await handler(JSON.parse(tc.argumentsRaw) as Record<string, unknown>, model)
          } catch (err: unknown) {
            console.error(`[agent] Error calling tool '${tc.name}'`, err)
            result = { error: (err as Error).message }
          }
        }

        await pushSse({ type: 'tool-result', toolName: tc.name, result, model, toolCalledWith: tc.argumentsRaw })

        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(result),
          toolCalledWith: tc.argumentsRaw,
        } satisfies LoopMessage
      })
    )

    messages.push(...toolResults as ChatCompletionMessageParam[])
    generatedMessages.push(...toolResults)
  }

  await pushSse({ type: 'done' })
  return { messages: generatedMessages, usagePerTurn }
}
