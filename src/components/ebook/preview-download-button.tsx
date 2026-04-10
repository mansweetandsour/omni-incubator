'use client'

interface PreviewDownloadButtonProps {
  productId: string
}

export function PreviewDownloadButton({ productId }: PreviewDownloadButtonProps) {
  return (
    <a
      href={`/api/ebooks/${productId}/preview`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
    >
      Download Preview PDF
    </a>
  )
}
