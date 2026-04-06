<script setup lang="ts">
const input = ref('')
const loading = ref(false)
const chatId = crypto.randomUUID()
const librarySelection = ref<FileAttachment[]>([])
const showFileBrowser = ref(false)
const { model } = useModels()
const { ensureLoaded: ensureToolsLoaded } = useTools()
await ensureToolsLoaded()

const {
  dropzoneRef,
  isDragging,
  open,
  files,
  isUploading,
  uploadedFiles,
  removeFile,
  clearFiles
} = useFileUploadWithStatus()

async function createChat(prompt: string) {
  input.value = prompt
  loading.value = true

  const attachments = [...uploadedFiles.value, ...librarySelection.value]

  const chat = await $fetch('/api/chats', {
    method: 'POST',
    body: {
      id: chatId,
      message: prompt,
      model: model.value,
      ...(attachments.length > 0 ? { files: attachments } : {})
    }
  })

  refreshNuxtData('chats')
  navigateTo(`/chat/${chat?.id}`)
}

async function onSubmit() {
  await createChat(input.value)
  clearFiles()
}
</script>

<template>
  <UDashboardPanel
    id="home"
    class="min-h-0"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <div ref="dropzoneRef" class="flex flex-1">
        <DragDropOverlay :show="isDragging" />

        <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
          <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
            W czym moge Ci pomoc?
          </h1>

          <UChatPrompt
            v-model="input"
            :status="loading ? 'streaming' : 'ready'"
            :disabled="isUploading"
            class="[view-transition-name:chat-prompt]"
            variant="subtle"
            :ui="{ base: 'px-1.5' }"
            @submit="onSubmit"
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

              <UChatPromptSubmit color="neutral" size="sm" :disabled="isUploading" />
            </template>
          </UChatPrompt>
        </UContainer>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="showFileBrowser" title="Biblioteka plików" description="Wybierz pliki do dołączenia do wiadomości" :ui="{ body: 'overflow-y-auto max-h-[60vh]' }">
    <template #body>
      <FileBrowser v-model="librarySelection" />
    </template>
    <template #footer>
      <UButton label="Gotowe" color="primary" @click="showFileBrowser = false" />
    </template>
  </UModal>
</template>
