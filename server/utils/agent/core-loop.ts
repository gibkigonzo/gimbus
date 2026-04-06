import type OpenAI from 'openai'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'

interface ToolCallDelta {
  id: string
  name: string
  argumentsRaw: string
}

export async function runAgentLoopCore(
  pushSse: (chunk: SseChunk) => Promise<void> | void,
  initialMessages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[],
  handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
  model = 'openai/gpt-4o-mini',
  maxIterations = 30,
  onAssistantUsage?: (usage: AssistantUsage | null) => void,
  signal?: AbortSignal
): Promise<ChatCompletionMessageParam[]> {
  const client = createOpenRouter()
  const messages: ChatCompletionMessageParam[] = [...initialMessages]

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    if (signal?.aborted) break
    let assistantContent = ''
    const toolCallsMap: Record<string, ToolCallDelta> = {}
    let iterationUsage: AssistantUsage | null = null

    const streamParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model,
      messages: messages,
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
                toolCallsMap[idx].id = toolCallsMap[idx]!.id + (tc.id ?? '')
                toolCallsMap[idx].name = toolCallsMap[idx]!.name + (tc.function?.name ?? '')
                toolCallsMap[idx].argumentsRaw = toolCallsMap[idx]!.argumentsRaw + (tc.function?.arguments ?? '')
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
    onAssistantUsage?.(iterationUsage)

    const assistantMessage: ChatCompletionMessageParam = toolCalls.length > 0
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

    messages.push(assistantMessage)

    if (toolCalls.length === 0) {
      break
    }

    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        const handler = handlers[tc.name]
        let result: unknown
        if (!handler) {
          result = { error: `Tool '${tc.name}' not found` }
        } else {
          try {
            console.log(`[agent] Calling tool '${tc.name}' with arguments:`, tc.argumentsRaw)
            const args = JSON.parse(tc.argumentsRaw) as Record<string, unknown>
            result = await handler(args)
          } catch (err: unknown) {
            console.error(`[agent] Error calling tool '${tc.name}'`, err)
            result = { error: (err as Error).message }
          }
        }

        await pushSse({ type: 'tool-result', toolName: tc.name, result, model, toolCalledWith: tc.argumentsRaw })

        const workflowId = (result != null && typeof result === 'object' && 'workflowId' in result)
          ? (result as Record<string, unknown>).workflowId as string
          : undefined

        return {
          role: 'tool' as const,
          tool_call_id: tc.id,
          content: JSON.stringify(result),
          toolName: tc.name,
          toolCalledWith: tc.argumentsRaw,
          workflowId
        }
      })
    )

    messages.push(...toolResults)
  }

  await pushSse({ type: 'done' })
  return messages
}
