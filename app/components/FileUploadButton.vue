<script setup lang="ts">
defineProps<{
  open: () => void
}>()
</script>

<template>
  <UButton
    icon="i-lucide-paperclip"
    variant="ghost"
    color="neutral"
    size="sm"
    @click="open()"
  />
</template>
