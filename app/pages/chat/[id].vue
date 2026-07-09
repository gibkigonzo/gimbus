<script setup lang="ts">
import type { DefineComponent } from 'vue'
import { useClipboard } from '@vueuse/core'
import ProseStreamPre from '../../components/prose/PreStream.vue'
import type { AgentMessage } from '#shared/types/agent'
import type { UIMessage, ChatStatus } from 'ai'

const components = {
  pre: ProseStreamPre as unknown as DefineComponent
}

const route = useRoute()
const toast = useToast()
const clipboard = useClipboard()

const chatStatus = computed(() => {
  if (chat.error.value) return 'error'
  return chat.status.value
})

// UChatMessages/UChatPromptSubmit are typed against ai-sdk's UIMessage/ChatStatus.
// This app deliberately uses its own AgentMessage model (includes a 'tool' role
// with no ai-sdk equivalent) — chatStatus's 'idle' maps 1:1 onto ai-sdk's 'ready'.
const uiChatStatus = computed<ChatStatus>(() => chatStatus.value === 'idle' ? 'ready' : chatStatus.value)

const {
  isDragging,
  open,
  files,
  isUploading,
  uploadedFiles,
  removeFile,
  clearFiles
} = useFileUploadWithStatus()

const { data } = await useFetch(`/api/chats/${route.params.id}`, {
  cache: 'force-cache'
})
if (!data.value) {
  throw createError({ statusCode: 404, statusMessage: 'Chat not found' })
}

const input = ref('')
const librarySelection = ref<FileAttachment[]>([])
const showFileBrowser = ref(false)
const { ensureLoaded: ensureToolsLoaded } = useTools()
await ensureToolsLoaded()

const chat = useAgentChat({
  chatId: data.value.id,
  initialMessages: data.value.messages as AgentMessage[]
})

const chatMessages = computed(() => chat.messages.value)
const chatError = computed(() => chat.error.value ?? undefined)

// AgentMessage[] doesn't structurally match ai-sdk's UIMessage[] (different role set,
// no ai-sdk equivalent of our 'tool' role) — bridge explicitly via `unknown` rather than `any`.
const uiMessages = computed(() => chatMessages.value as unknown as UIMessage[])

async function handleSubmit(e: Event) {
  e.preventDefault()
  if (input.value.trim() && !isUploading.value) {
    const message = input.value
    const attachments = [...uploadedFiles.value, ...librarySelection.value]
    input.value = ''
    librarySelection.value = []
    await chat.sendMessage(message, attachments)
    clearFiles()
  }
}

const copied = ref(false)

const castAgentMessage = (message: UIMessage): AgentMessage => message as unknown as AgentMessage

function copy(_e: MouseEvent, message: UIMessage) {
  clipboard.copy(castAgentMessage(message).content)
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 2000)
}

// True only for a genuinely brand-new chat (no assistant reply anywhere yet) —
// the very first turn, silently auto-continued right after chat creation.
const isBrandNewChat = data.value?.messages.every(m => m.role !== 'assistant') ?? false

onMounted(() => {
  if (isBrandNewChat) {
    void chat.triggerAgent()
  }
})

// A later turn that got interrupted (refresh, closed tab) before the model
// replied leaves the last message as 'user' with no assistant reply — unlike
// the brand-new-chat case, this is never auto-continued: it requires an
// explicit click so a dropped connection doesn't silently re-spend tokens
// the moment you reopen the chat.
const needsReply = computed(() => {
  if (isBrandNewChat || chatStatus.value === 'streaming') return false
  return chatMessages.value.at(-1)?.role === 'user'
})

// Show toast on error
watch(chat.error, (err) => {
  if (err) {
    toast.add({
      description: err.message,
      icon: 'i-lucide-alert-circle',
      color: 'error',
      duration: 0
    })
  }
})
</script>

<template>
  <UDashboardPanel
    id="chat"
    class="relative min-h-0"
    :ui="{ body: 'p-0 sm:p-0 overscroll-none' }"
  >
    <template #header>
      <DashboardNavbar />
    </template>
    <template #body>
      <div ref="dropzoneRef" class="flex flex-1">
        <DragDropOverlay :show="isDragging" />

        <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
          <UChatMessages
            should-auto-scroll
            :messages="uiMessages"
            :status="uiChatStatus"
            :assistant="chatStatus !== 'streaming' ? { actions: [{ label: 'Kopiuj', icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy', onClick: copy }] } : { actions: [] }"
            :spacing-offset="160"
            class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
          >
            <template #content="{ message }">
              <!-- Role + model indicator -->
              <div class="flex items-center gap-1.5 mb-2">
                <UBadge
                  v-if="castAgentMessage(message).role === 'user' || castAgentMessage(message).role === 'assistant'"
                  :label="castAgentMessage(message).role === 'user' ? 'Użytkownik' : 'Gimbus'"
                  :color="castAgentMessage(message).role === 'user' ? 'primary' : 'neutral'"
                  variant="subtle"
                  size="xl"
                />
                <UBadge
                  v-if="castAgentMessage(message).role === 'tool'"
                  label="Narzędzie"
                  color="info"
                  variant="subtle"
                  size="xl"
                />
                <UBadge
                  v-if="(castAgentMessage(message).role === 'assistant' || castAgentMessage(message).role === 'tool') && castAgentMessage(message).model"
                  :label="castAgentMessage(message).model!"
                  color="neutral"
                  variant="outline"
                  size="lg"
                />
              </div>

              <template v-for="(part, index) in castAgentMessage(message).parts" :key="`${castAgentMessage(message).id}-${part.type}-${index}`">
                <!-- Only render markdown for assistant messages to prevent XSS from user input -->
                <MDCCached
                  v-if="part.type === 'text' && castAgentMessage(message).role === 'assistant'"
                  :value="part.text"
                  :cache-key="`${castAgentMessage(message).id}-${index}`"
                  :components="components"
                  :parser-options="{ highlight: false }"
                  class="*:first:mt-0 *:last:mb-0"
                />
                <!-- User messages are rendered as plain text (safely escaped by Vue) -->
                <p v-else-if="part.type === 'text' && castAgentMessage(message).role === 'user'" class="whitespace-pre-wrap">
                  {{ part.text }}
                </p>
                <!-- Tool result -->
                <div
                  v-else-if="part.type === 'tool-result'"
                  class="text-xs font-mono my-1"
                >
                  <div class="text-muted font-semibold mb-1.5">
                    {{ part.toolName }}
                  </div>
                  <template v-if="part.toolName === 'image_process' && JSON.parse(part.result as string)?.pathname">
                    <img
                      :src="`/api/blob/${JSON.parse(part.result as string).pathname}`"
                      class="rounded max-w-sm max-h-64 object-contain"
                    >
                  </template>
                  <UTabs
                    v-else
                    default-value="result"
                    :items="[
                      { label: 'Wynik', value: 'result' },
                      { label: 'Argumenty', value: 'args' }
                    ]"
                    size="xs"
                    color="neutral"
                    variant="link"
                  >
                    <template #content="{ item }">
                      <pre
                        v-if="item.value === 'result'"
                        class="bg-muted rounded p-2 whitespace-pre-wrap overflow-auto max-h-64 mt-1"
                      >{{ JSON.parse(part.result as string) }}</pre>
                      <pre
                        v-else
                        class="bg-muted rounded p-2 whitespace-pre-wrap overflow-auto max-h-64 mt-1"
                      >{{ JSON.parse(part.toolCalledWith ?? '{}') }}</pre>
                    </template>
                  </UTabs>
                </div>
              </template>

              <!-- Token usage: each step's cost lands on whichever message that step
                   produced — a pure tool-calling step (no text output) still has one,
                   attached to its tool-result message, not the assistant role only -->
              <div
                v-if="(castAgentMessage(message).role === 'assistant' || castAgentMessage(message).role === 'tool') && (castAgentMessage(message).inputTokens || castAgentMessage(message).outputTokens)"
                class="flex items-center gap-1.5 mt-2 flex-wrap"
              >
                <UBadge
                  :label="`wej: ${castAgentMessage(message).inputTokens}`"
                  color="neutral"
                  variant="outline"
                  size="lg"
                />
                <UBadge
                  :label="`wyj: ${castAgentMessage(message).outputTokens}`"
                  color="neutral"
                  variant="outline"
                  size="lg"
                />
                <UBadge
                  v-if="castAgentMessage(message).cachedTokens"
                  :label="`cache: ${castAgentMessage(message).cachedTokens}`"
                  color="success"
                  variant="subtle"
                  size="lg"
                />
                <UBadge
                  v-if="castAgentMessage(message).truncated"
                  label="ucięte — limit tokenów"
                  color="warning"
                  variant="subtle"
                  size="lg"
                />
              </div>
            </template>
          </UChatMessages>

          <div v-if="needsReply" class="flex justify-center pb-2">
            <UButton
              label="Wygeneruj odpowiedź"
              icon="i-lucide-rotate-cw"
              color="neutral"
              variant="subtle"
              @click="chat.triggerAgent()"
            />
          </div>

          <UChatPrompt
            v-model="input"
            :error="chatError"
            :disabled="isUploading"
            variant="subtle"
            class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
            :ui="{ base: 'px-1.5' }"
            @submit="handleSubmit"
          >
            <template v-if="files.length > 0 || librarySelection.length > 0" #header>
              <div class="flex flex-wrap gap-2">
                <FileAvatar
                  v-for="fileWithStatus in files"
                  :key="fileWithStatus.id"
                  :name="fileWithStatus.file.name"
                  :type="fileWithStatus.file.type"
                  :preview-url="fileWithStatus.previewUrl"
                  :status="fileWithStatus.status"
                  :error="fileWithStatus.error"
                  removable
                  @remove="removeFile(fileWithStatus.id)"
                />
                <UBadge
                  v-if="librarySelection.length > 0"
                  :label="`${librarySelection.length} z biblioteki`"
                  color="neutral"
                  variant="subtle"
                  class="cursor-pointer"
                  @click="showFileBrowser = true"
                />
              </div>
            </template>

            <template #footer>
              <div class="flex items-center gap-1">
                <FileUploadButton :open="open" />
                <UButton
                  icon="i-lucide-images"
                  size="sm"
                  color="neutral"
                  variant="ghost"
                  :badge="librarySelection.length > 0 ? String(librarySelection.length) : undefined"
                  @click="showFileBrowser = true"
                />
                <ToolsSelect />
                <ModelSelect />
              </div>

              <UChatPromptSubmit
                :status="uiChatStatus"
                :disabled="isUploading"
                color="neutral"
                size="sm"
                @stop="chat.stop()"
                @reload="chat.regenerate()"
              />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    v-model:open="showFileBrowser"
    title="Biblioteka plików"
    description="Wybierz pliki do dołączenia do wiadomości"
    :ui="{ body: 'overflow-y-auto max-h-[60vh]' }"
  >
    <template #body>
      <FileBrowser v-model="librarySelection" />
    </template>
    <template #footer>
      <UButton label="Gotowe" color="primary" @click="showFileBrowser = false" />
    </template>
  </UModal>
</template>
