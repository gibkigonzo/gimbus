export interface FileRecord {
  id: string
  originalName: string
  mediaType: string
  pathname: string
  playgroundPath: string | null
  descriptionPath: string | null
  description: string | null
  size: number
  createdAt: Date
}

export function useFiles() {
  const { data: files, refresh } = useFetch<FileRecord[]>('/api/files', {
    default: () => []
  })

  async function deleteFile(id: string) {
    await $fetch(`/api/files/${id}`, { method: 'DELETE' })
    await refresh()
  }

  return {
    files,
    refresh,
    deleteFile
  }
}
