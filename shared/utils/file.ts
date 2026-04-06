export interface FileWithStatus {
  file: File
  id: string
  previewUrl: string
  status: 'uploading' | 'uploaded' | 'error'
  uploadedPathname?: string
  uploadedFileId?: string
  uploadedPlaygroundPath?: string | null
  uploadedIsChunked?: boolean
  error?: string
}

export interface FileAttachment {
  type: 'file'
  mediaType: string
  pathname: string
  fileId?: string
  playgroundPath?: string
  isChunked?: boolean
}

export const FILE_UPLOAD_CONFIG = {
  maxSize: '8MB',
  types: ['image', 'application/pdf', 'text/csv', 'text/plain'],
  acceptPattern: 'image/*,application/pdf,.csv,text/csv,text/plain'
} as const

export function getFileIcon(mimeType: string, fileName?: string): string {
  if (mimeType.startsWith('image/')) return 'i-lucide-image'
  if (mimeType === 'application/pdf') return 'i-lucide-file-text'
  if (mimeType === 'text/csv' || fileName?.endsWith('.csv')) return 'i-lucide-file-spreadsheet'
  if (mimeType === 'text/plain' || fileName?.endsWith('.txt')) return 'i-lucide-file-text'
  return 'i-lucide-file'
}

export function removeRandomSuffix(filename: string): string {
  return filename.replace(/^(.+)-[a-zA-Z0-9]+(\.[^.]+)$/, '$1$2')
}
