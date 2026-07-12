import type { AgentMessage } from '#shared/types/agent'
import type { FileAttachment } from '#shared/utils/file'
import { useModels } from './useModels'
import { LazyModalConfirm } from '#components'

async function handleConfirmationRequest(chatId: string, chunk: SseConfirmationRequest) {
  const overlay = useOverlay()
  const modal = overlay.create(LazyModalConfirm, {
    props: {
      title: `Allow "${chunk.toolName}"?`,
      description: `The agent wants to call "${chunk.toolName}" with:\n${JSON.stringify(chunk.input)}`,
      confirmLabel: 'Allow',
      cancelLabel: 'Deny'
    }
  })
  const approved = await modal.open()

  await $fetch(`/api/chats/${chatId}/confirm`, {
    method: 'POST',
    body: { confirmationId: chunk.confirmationId, approved: !!approved }
  }).catch(() => {})
}

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
          let chunk: SseChunk
          try {
            chunk = JSON.parse(jsonStr) as SseChunk
          } catch (err) {
            // Our own server always emits `data: ${JSON.stringify(chunk)}` — a parse
            // failure here means the framing contract broke, not "bad external input".
            // Log loudly rather than silently dropping it; skip only this one frame.
            console.error('[useAgentChat] Failed to parse SSE chunk', jsonStr, err)
            continue
          }

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
            // A step's usage lands on whichever message that step actually produced —
            // a pure tool-calling step never emits a text-delta, so it never creates
            // an assistant-role message; the just-pushed tool-result message is the
            // real target. Filtering to role === 'assistant' here silently dropped
            // (or misattributed to a stale earlier message) all usage for tool-only steps.
            const lastMessage = messages.value[messages.value.length - 1]
            if (lastMessage) {
              lastMessage.inputTokens = chunk.inputTokens
              lastMessage.outputTokens = chunk.outputTokens
              lastMessage.cachedTokens = chunk.cachedTokens
              lastMessage.model = chunk.model
              lastMessage.truncated = chunk.truncated
            }
          } else if (chunk.type === 'title') {
            refreshNuxtData('/api/chats')
          } else if (chunk.type === 'confirmation-request') {
            // Fire-and-forget: the server is already paused waiting on this
            // response, so nothing else will arrive on the stream until the
            // user answers — no need to block this loop on the modal.
            handleConfirmationRequest(chatId, chunk)
          } else if (chunk.type === 'done') {
            // Stream finished
          } else if (chunk.type === 'error') {
            throw new Error((chunk as { message?: string }).message ?? 'Unknown agent error')
          } else {
            // Server and client must stay in sync on SseChunk's variants (see CLAUDE.md) —
            // an unrecognized type means one side shipped a chunk the other doesn't handle yet.
            console.error('[useAgentChat] Unrecognized SSE chunk type', chunk)
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
    // Optimistically mirror what persist.ts will save server-side (sealed:
    // false on whatever's left of an aborted turn) so needsReply picks this
    // up immediately — without it, a locally-streamed message has no
    // `sealed` field at all until a reload re-fetches it from the DB.
    const last = messages.value[messages.value.length - 1]
    if (last && last.role !== 'user') last.sealed = false
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
