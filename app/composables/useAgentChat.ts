import type { AgentMessage } from '#shared/types/agent'
import type { FileAttachment } from '#shared/utils/file'
import { useModels } from './useModels'

export type AgentChatStatus = 'idle' | 'streaming' | 'error'

export interface UseAgentChatOptions {
  chatId: string
  initialMessages?: AgentMessage[]
}

export function useAgentChat({ chatId, initialMessages = [] }: UseAgentChatOptions) {
  const messages = ref<AgentMessage[]>(initialMessages)
  const status = ref<AgentChatStatus>('idle')
  const error = ref<Error | null>(null)
  const { model } = useModels()
  const { selectedToolNames } = useTools()

  let abortController: AbortController | null = null

  async function runStream(body: Record<string, unknown>) {
    abortController = new AbortController()

    try {
      const response = await fetch(`/api/chats/${chatId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.value,
          allowTools: selectedToolNames.value,
          ...body
        }),
        signal: abortController.signal
      })

      if (!response.ok || !response.body) {
        const body = await response.text().catch(() => response.statusText)
        throw new Error(body || `HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process all complete SSE lines in buffer
        let newlineIdx: number
        while ((newlineIdx = buffer.indexOf('\n\n')) !== -1) {
          const rawLine = buffer.slice(0, newlineIdx).trim()
          buffer = buffer.slice(newlineIdx + 2)

          if (!rawLine.startsWith('data: ')) continue

          const jsonStr = rawLine.slice(6)
          try {
            const chunk = JSON.parse(jsonStr) as SseChunk

            if (chunk.type === 'text-delta' && chunk.text) {
              let lastAssistantMessage = messages.value[messages.value.length - 1]
              if (!lastAssistantMessage || lastAssistantMessage.role !== 'assistant') {
                lastAssistantMessage = {
                  id: crypto.randomUUID(),
                  role: 'assistant',
                  content: chunk.text,
                  parts: [{ type: 'text', text: chunk.text }]
                }
                messages.value.push(lastAssistantMessage)
              } else {
                lastAssistantMessage.content += chunk.text
                lastAssistantMessage.parts[0] = { type: 'text', text: lastAssistantMessage.content }
              }
            } else if (chunk.type === 'tool-result') {
              messages.value.push({
                id: crypto.randomUUID(),
                role: 'tool',
                content: '',
                parts: [{
                  type: 'tool-result',
                  toolName: chunk.toolName ?? '',
                  result: JSON.stringify(chunk.result),
                  toolCalledWith: chunk.toolCalledWith ?? null
                }],
                model: chunk.model
              })
            } else if (chunk.type === 'usage') {
              const lastAssistantMessage = messages.value.findLast(m => m.role === 'assistant')!
              if (lastAssistantMessage) {
                lastAssistantMessage.inputTokens = chunk.inputTokens
                lastAssistantMessage.outputTokens = chunk.outputTokens
                lastAssistantMessage.cachedTokens = chunk.cachedTokens
                lastAssistantMessage.model = chunk.model
              }
            } else if (chunk.type === 'done') {
              // Stream finished
            } else if (chunk.type === 'error') {
              throw new Error((chunk as { message?: string }).message ?? 'Unknown agent error')
            }
          } catch {
            // Ignore malformed JSON chunks
          }
        }
      }

      status.value = 'idle'
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        status.value = 'idle'
        return
      }
      error.value = err instanceof Error ? err : new Error(String(err))
      status.value = 'error'
    } finally {
      abortController = null
    }
  }

  async function sendMessage(text: string, files?: FileAttachment[]) {
    if (status.value === 'streaming') return
    error.value = null
    status.value = 'streaming'
    messages.value.push({
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      parts: [{ type: 'text', text }]
    })
    await runStream({ message: text, ...(files && files.length > 0 ? { files } : {}) })
  }

  async function triggerAgent() {
    if (status.value === 'streaming') return
    error.value = null
    status.value = 'streaming'
    await runStream({})
  }

  function stop() {
    abortController?.abort()
    status.value = 'idle'
  }

  async function regenerate() {
    // Find last user message and resend it
    const lastUser = [...messages.value].reverse().find(m => m.role === 'user')
    if (!lastUser) return

    // Remove all messages after (and including) the last assistant reply
    const lastUserIdx = messages.value.lastIndexOf(lastUser)
    messages.value = messages.value.slice(0, lastUserIdx)

    await sendMessage(lastUser.content)
  }

  return {
    messages,
    status,
    error,
    sendMessage,
    triggerAgent,
    stop,
    regenerate
  }
}
