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
const router = useRouter()
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

// Explicitly marks this chat "seen" (a dedicated action, not a side effect of
// the GET above — that GET is also hit by app/layouts/default.vue's sidebar
// prefetch, a background warm-up rather than a real visit; see
// server/api/chats/[id]/seen.post.ts) then refreshes the sidebar's own list
// fetch (key: 'chats', see app/layouts/default.vue) so its badge drops.
await $fetch(`/api/chats/${route.params.id}/seen`, { method: 'POST' }).catch(() => {})
refreshNuxtData('chats')

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

// "No assistant reply yet" alone doesn't mean "brand new" — a chat where a
// turn was cancelled or dropped mid-stream can also have no assistant reply
// at all yet (e.g. aborted before any step finished). The `?new=1` query
// param set only by index.vue's post-creation navigateTo() is what
// disambiguates "just created, first turn never ran" from "returning to an
// incomplete state" — both must hold.
const isBrandNewChat = (data.value?.messages.every(m => m.role !== 'assistant') ?? false) && route.query.new === '1'

onMounted(() => {
  // One-shot signal — strip it immediately so a later reload of this same
  // URL (e.g. after cancelling generation) is no longer mistaken for "new".
  if (route.query.new !== undefined) {
    const { new: _new, ...query } = route.query
    void router.replace({ query })
  }

  if (isBrandNewChat) {
    // Use the tool selection captured by index.vue at the moment this chat
    // was actually created (see createChat()'s sessionStorage write), not
    // whatever the shared `allowTools` cookie reads right now — this mount
    // happens after navigation, and the cookie could have changed in
    // between (e.g. the tools popover reopened on this very page) despite
    // the user having submitted with a different selection showing.
    const key = `gimbus:allowTools:${data.value!.id}`
    const captured = sessionStorage.getItem(key)
    sessionStorage.removeItem(key)
    void chat.triggerAgent(captured ? JSON.parse(captured) as string[] : undefined)
  }
})

// A later turn that got interrupted leaves either no reply at all (last
// message role 'user') or, since saveTurn now persists whatever fully-
// completed steps happened before the abort (see persist.ts), a trailing
// assistant/tool message marked sealed: false. Either shape means the turn
// didn't finish — unlike the brand-new-chat case, this is never
// auto-continued: it requires an explicit click so a dropped connection
// doesn't silently re-spend tokens the moment you reopen the chat.
// (`sealed` on a live, not-yet-persisted message is `undefined`, not `false`
// — the strict check below only fires once a refetch confirms it from the DB.)
const needsReply = computed(() => {
  if (isBrandNewChat || chatStatus.value === 'streaming') return false
  const last = chatMessages.value.at(-1)
  if (!last) return false
  return last.role === 'user' || last.sealed === false
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
              <!-- Role + model + token usage, all condensed into a single line -->
              <div class="flex items-center gap-1 mb-2 flex-wrap">
                <UBadge
                  v-if="castAgentMessage(message).role === 'user' || castAgentMessage(message).role === 'assistant'"
                  :label="castAgentMessage(message).role === 'user' ? 'Użytkownik' : 'Gimbus'"
                  :color="castAgentMessage(message).role === 'user' ? 'primary' : 'neutral'"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-if="castAgentMessage(message).role === 'tool'"
                  label="Narzędzie"
                  color="info"
                  variant="subtle"
                  size="sm"
                />
                <UBadge
                  v-if="(castAgentMessage(message).role === 'assistant' || castAgentMessage(message).role === 'tool') && castAgentMessage(message).model"
                  :label="castAgentMessage(message).model!"
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <template v-if="(castAgentMessage(message).role === 'assistant' || castAgentMessage(message).role === 'tool') && (castAgentMessage(message).inputTokens || castAgentMessage(message).outputTokens)">
                  <UBadge
                    :label="`wej: ${castAgentMessage(message).inputTokens}`"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                  <UBadge
                    :label="`wyj: ${castAgentMessage(message).outputTokens}`"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                  <UBadge
                    v-if="castAgentMessage(message).cachedTokens"
                    :label="`cache: ${castAgentMessage(message).cachedTokens}`"
                    color="success"
                    variant="subtle"
                    size="sm"
                  />
                  <UBadge
                    v-if="castAgentMessage(message).truncated"
                    label="ucięte — limit tokenów"
                    color="warning"
                    variant="subtle"
                    size="sm"
                  />
                </template>
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
                <ToolResultCard
                  v-else-if="part.type === 'tool-result'"
                  :tool-name="part.toolName"
                  :result="part.result as string"
                  :tool-called-with="part.toolCalledWith"
                />
              </template>
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
