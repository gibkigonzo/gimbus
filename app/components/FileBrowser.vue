<script setup lang="ts">
import type { FileAttachment } from '#shared/utils/file'
import { useFiles, type FileRecord } from '~/composables/useFiles'
import { LazyModalConfirm } from '#components'

const props = withDefaults(defineProps<{
  modelValue: FileAttachment[]
}>(), {
  modelValue: () => []
})

const emit = defineEmits<{
  'update:modelValue': [FileAttachment[]]
}>()

const { files, deleteFile } = useFiles()
const overlay = useOverlay()
const toast = useToast()

const selectedIds = computed(() => new Set(props.modelValue.map(f => f.fileId).filter(Boolean)))

function isSelected(file: FileRecord): boolean {
  return selectedIds.value.has(file.id)
}

function toggleSelect(file: FileRecord) {
  const attachment: FileAttachment = {
    type: 'file',
    mediaType: file.mediaType,
    pathname: file.pathname,
    fileId: file.id,
    playgroundPath: file.playgroundPath ?? undefined,
    isChunked: file.isChunked
  }

  if (isSelected(file)) {
    emit('update:modelValue', props.modelValue.filter(f => f.fileId !== file.id))
  } else {
    emit('update:modelValue', [...props.modelValue, attachment])
  }
}

async function confirmDelete(file: FileRecord) {
  const modal = overlay.create(LazyModalConfirm, {
    props: {
      title: 'Delete file',
      description: `Permanently delete "${file.originalName}"? This cannot be undone.`
    }
  })
  const confirmed = await modal.open()
  if (!confirmed) return

  try {
    await deleteFile(file.id)
    // Remove from current selection if it was selected
    if (isSelected(file)) {
      emit('update:modelValue', props.modelValue.filter(f => f.fileId !== file.id))
    }
    toast.add({ title: 'File deleted', icon: 'i-lucide-trash-2', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to delete file', icon: 'i-lucide-alert-circle', color: 'error' })
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <p v-if="!files?.length" class="text-sm text-muted text-center py-4">
      No files uploaded yet.
    </p>
    <div
      v-else
      class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
    >
      <div
        v-for="file in files"
        :key="file.id"
        class="relative group rounded-lg border cursor-pointer select-none transition-colors"
        :class="isSelected(file) ? 'border-primary bg-primary/5' : 'border-default hover:border-muted'"
        @click="toggleSelect(file)"
      >
        <!-- Thumbnail for images -->
        <div class="aspect-square overflow-hidden rounded-t-lg bg-muted/30 flex items-center justify-center">
          <img
            v-if="file.mediaType.startsWith('image/')"
            :src="`/api/blob/${file.pathname}`"
            :alt="file.originalName"
            class="w-full h-full object-cover"
          >
          <UIcon
            v-else
            :name="getFileIcon(file.mediaType, file.originalName)"
            class="size-10 text-muted"
          />
        </div>

        <!-- File info -->
        <div class="p-2">
          <p class="text-xs font-medium truncate" :title="file.originalName">
            {{ removeRandomSuffix(file.originalName) }}
          </p>
          <p v-if="file.description" class="text-xs text-muted line-clamp-2 mt-0.5">
            {{ file.description }}
          </p>
          <p class="text-xs text-muted mt-0.5">
            {{ formatSize(file.size) }}
          </p>
        </div>

        <!-- Selected indicator -->
        <div
          v-if="isSelected(file)"
          class="absolute top-1.5 left-1.5 size-5 rounded-full bg-primary flex items-center justify-center"
        >
          <UIcon name="i-lucide-check" class="size-3 text-white" />
        </div>

        <!-- Delete button -->
        <UButton
          icon="i-lucide-trash-2"
          size="xs"
          color="error"
          variant="ghost"
          class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
          @click.stop="confirmDelete(file)"
        />
      </div>
    </div>
  </div>
</template>
