<script setup lang="ts">
const props = defineProps<{
  toolName: string
  result: string
  toolCalledWith?: string | null
}>()

const open = ref(false)

const parsedResult = computed(() => {
  try {
    return JSON.parse(props.result)
  } catch {
    return props.result
  }
})

const parsedArgs = computed(() => {
  try {
    return JSON.parse(props.toolCalledWith ?? '{}')
  } catch {
    return {}
  }
})

const isError = computed(() => {
  const r = parsedResult.value
  return !!(r && typeof r === 'object' && 'error' in r && (r as { error?: unknown }).error)
})

const isImagePreview = computed(() => props.toolName === 'image_process' && !!(parsedResult.value as { pathname?: string } | null)?.pathname)

const preview = computed(() => {
  if (isImagePreview.value) return 'obraz wygenerowany'
  const r = parsedResult.value
  return typeof r === 'string' ? r : JSON.stringify(r)
})
</script>

<template>
  <div class="text-xs font-mono my-1 border border-default rounded-md">
    <button
      type="button"
      class="w-full flex items-center gap-1.5 px-2 py-1 text-left rounded-md hover:bg-muted/50 cursor-pointer"
      @click="open = !open"
    >
      <UIcon
        :name="open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="shrink-0 size-3.5 text-muted"
      />
      <UIcon
        :name="isError ? 'i-lucide-circle-x' : 'i-lucide-circle-check'"
        :class="isError ? 'text-error' : 'text-success'"
        class="shrink-0 size-3.5"
      />
      <span class="font-semibold shrink-0">{{ toolName }}</span>
      <span class="text-muted truncate">{{ preview }}</span>
    </button>

    <div v-if="open" class="px-2 pb-2 pt-0.5">
      <img
        v-if="isImagePreview"
        :src="`/api/blob/${(parsedResult as { pathname: string }).pathname}`"
        class="rounded max-w-sm max-h-64 object-contain mt-1"
      >
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
          >{{ parsedResult }}</pre>
          <pre
            v-else
            class="bg-muted rounded p-2 whitespace-pre-wrap overflow-auto max-h-64 mt-1"
          >{{ parsedArgs }}</pre>
        </template>
      </UTabs>
    </div>
  </div>
</template>
