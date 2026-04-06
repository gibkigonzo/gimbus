interface UploadedFileRecord {
  fileId: string
  pathname: string
  mediaType: string
  originalName: string
  playgroundPath: string | null
  isChunked: boolean
  descriptionPath: string | null
  description: string | null
  size: number
}

function createObjectUrl(file: File): string {
  return URL.createObjectURL(file)
}

function fileToInput(file: File): HTMLInputElement {
  const dataTransfer = new DataTransfer()
  dataTransfer.items.add(file)

  const input = document.createElement('input')
  input.type = 'file'
  input.files = dataTransfer.files

  return input
}

export function useFileUploadWithStatus() {
  const files = ref<FileWithStatus[]>([])
  const toast = useToast()

  const upload = useUpload('/api/upload', {
    method: 'PUT'
  })

  async function uploadFiles(newFiles: File[]) {
    const filesWithStatus: FileWithStatus[] = newFiles.map(file => ({
      file,
      id: crypto.randomUUID(),
      previewUrl: createObjectUrl(file),
      status: 'uploading' as const
    }))

    files.value = [...files.value, ...filesWithStatus]

    const uploadPromises = filesWithStatus.map(async (fileWithStatus) => {
      const index = files.value.findIndex(f => f.id === fileWithStatus.id)
      if (index === -1) return

      try {
        const input = fileToInput(fileWithStatus.file)
        const response = await upload(input) as unknown as UploadedFileRecord | UploadedFileRecord[] | undefined

        if (!response) {
          throw new Error('Upload failed')
        }

        const result = Array.isArray(response) ? response[0] : response

        if (!result) {
          throw new Error('Upload failed')
        }
        files.value[index] = {
          ...files.value[index]!,
          status: 'uploaded',
          uploadedPathname: result.pathname,
          uploadedFileId: result.fileId,
          uploadedPlaygroundPath: result.playgroundPath,
          uploadedIsChunked: result.isChunked
        }
      } catch (error) {
        const errorMessage = (error as { data?: { message?: string } }).data?.message
          || (error as Error).message
          || 'Upload failed'
        toast.add({
          title: 'Upload failed',
          description: errorMessage,
          icon: 'i-lucide-alert-circle',
          color: 'error'
        })
        files.value[index] = {
          ...files.value[index]!,
          status: 'error',
          error: errorMessage
        }
      }
    })

    await Promise.allSettled(uploadPromises)
  }

  const { dropzoneRef, isDragging, open } = useFileUpload({
    accept: FILE_UPLOAD_CONFIG.acceptPattern,
    multiple: true,
    onUpdate: uploadFiles
  })

  const isUploading = computed(() =>
    files.value.some(f => f.status === 'uploading')
  )

  const uploadedFiles = computed(() =>
    files.value
      .filter(f => f.status === 'uploaded' && f.uploadedPathname)
      .map(f => ({
        type: 'file' as const,
        mediaType: f.file.type,
        pathname: f.uploadedPathname!,
        fileId: f.uploadedFileId,
        playgroundPath: f.uploadedPlaygroundPath ?? undefined,
        isChunked: f.uploadedIsChunked
      }))
  )

  function removeFile(id: string) {
    const file = files.value.find(f => f.id === id)
    if (!file) return

    URL.revokeObjectURL(file.previewUrl)
    files.value = files.value.filter(f => f.id !== id)

    if (file.status === 'uploaded' && file.uploadedFileId) {
      $fetch(`/api/files/${file.uploadedFileId}`, {
        method: 'DELETE'
      }).catch((error) => {
        console.error('Failed to delete file:', error)
      })
    }
  }

  function clearFiles() {
    if (files.value.length === 0) return
    files.value.forEach(fileWithStatus => URL.revokeObjectURL(fileWithStatus.previewUrl))
    files.value = []
  }

  onUnmounted(() => {
    clearFiles()
  })

  return {
    dropzoneRef,
    isDragging,
    open,
    files,
    isUploading,
    uploadedFiles,
    addFiles: uploadFiles,
    removeFile,
    clearFiles
  }
}
