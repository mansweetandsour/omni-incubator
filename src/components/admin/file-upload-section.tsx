'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface FileUploadSectionProps {
  productId: string | undefined
  type: 'main' | 'preview' | 'cover'
  currentValue: string | null
  label: string
}

function getAccept(type: 'main' | 'preview' | 'cover'): string {
  if (type === 'cover') return 'image/jpeg,image/png,image/webp'
  return 'application/pdf'
}

function getStatusText(currentValue: string | null): string {
  if (!currentValue) return 'No file uploaded yet'
  const parts = currentValue.split('/')
  return `File uploaded: ${parts[parts.length - 1]}`
}

export function FileUploadSection({ productId, type, currentValue, label }: FileUploadSectionProps) {
  const [status, setStatus] = useState<string>(getStatusText(currentValue))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !productId) return

    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    try {
      const res = await fetch(`/api/admin/ebooks/${productId}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Upload failed' }))
        setError((data as { error?: string }).error ?? 'Upload failed')
        setLoading(false)
        return
      }

      const data = await res.json() as { path: string; url?: string }
      setStatus(`File uploaded: ${file.name}`)
      setLoading(false)
      // If cover, use returned url
      if (type === 'cover' && data.url) {
        setStatus(`Cover uploaded: ${file.name}`)
      }
    } catch {
      setError('Network error during upload')
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2 border rounded-md p-4 bg-zinc-50 dark:bg-zinc-900">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{label}</p>
      <p className="text-xs text-zinc-500">{status}</p>
      {productId ? (
        <div className="flex items-center gap-3">
          <input
            type="file"
            accept={getAccept(type)}
            disabled={loading}
            className="text-sm file:mr-2 file:rounded file:border-0 file:bg-zinc-200 file:px-3 file:py-1 file:text-xs file:font-medium hover:file:bg-zinc-300 disabled:opacity-50"
            onChange={handleFileChange}
          />
          {loading && (
            <span className="text-xs text-zinc-500 animate-pulse">Uploading…</span>
          )}
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" disabled>
          Save product first to enable uploads
        </Button>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
