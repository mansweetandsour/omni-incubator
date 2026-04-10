'use client'

import { useTransition } from 'react'
import { toggleSampleProductActive } from '@/app/actions/sample-products'

interface SampleProductToggleProps {
  id: string
  isActive: boolean
}

export function SampleProductToggle({ id, isActive }: SampleProductToggleProps) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      await toggleSampleProductActive(id, !isActive)
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline disabled:opacity-50"
    >
      {isPending ? '…' : isActive ? 'Deactivate' : 'Activate'}
    </button>
  )
}
