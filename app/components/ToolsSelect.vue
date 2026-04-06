<script setup lang="ts">
const { tools, selectedToolNames, isLoading, ensureLoaded } = useTools()

const open = ref(false)

const groups = computed(() => [{
  id: 'tools',
  label: 'Dostepne narzedzia',
  items: tools.value.map(tool => ({
    label: tool.name,
    value: tool.name,
    description: tool.description || 'Brak opisu',
    suffix: tool.sourceType === 'mcp' ? `MCP: ${tool.sourceName}` : 'Wbudowane'
  }))
}])

function onOpen(nextOpen: boolean) {
  open.value = nextOpen
  if (nextOpen) {
    void ensureLoaded()
  }
}
</script>

<template>
  <UPopover :content="{ side: 'top', align: 'start' }">
    <UButton
      color="neutral"
      variant="ghost"
      size="sm"
      icon="i-lucide-wrench"
      :label="`Narzędzia (${selectedToolNames.length})`"
      @click="void ensureLoaded()"
    />

    <template #content>
      <UCommandPalette
        v-model="selectedToolNames"
        multiple
        value-key="value"
        :loading="isLoading"
        :groups="groups"
        placeholder="Filtruj narzędzia..."
        class="h-72 w-[28rem]"
        @update:open="onOpen"
      />
    </template>
  </UPopover>
</template>
