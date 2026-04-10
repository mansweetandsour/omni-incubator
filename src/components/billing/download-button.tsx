'use client'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Download } from 'lucide-react'

interface DownloadButtonProps {
  ebookId: string
  label?: string
  className?: string
}

export function DownloadButton({ ebookId, label = 'Download', className }: DownloadButtonProps) {
  return (
    <a
      href={`/api/ebooks/${ebookId}/download`}
      className={cn(
        buttonVariants({ variant: 'default' }),
        'inline-flex items-center gap-2',
        className
      )}
    >
      <Download className="size-4" />
      {label}
    </a>
  )
}
