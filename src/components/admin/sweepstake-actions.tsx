'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { activateSweepstake, endSweepstake } from '@/app/(admin)/admin/sweepstakes/actions'

interface SweepstakeActionsProps {
  id: string
  status: string
}

export function SweepstakeActions({ id, status }: SweepstakeActionsProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleActivate() {
    setLoading(true)
    const result = await activateSweepstake(id)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Sweepstake activated')
      router.refresh()
    }
  }

  async function handleEnd() {
    setLoading(true)
    const result = await endSweepstake(id)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Sweepstake ended')
      router.refresh()
    }
  }

  return (
    <div className="flex items-center gap-1">
      {status === 'draft' || status === 'ended' ? (
        <button
          onClick={handleActivate}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
        >
          Activate
        </button>
      ) : null}
      {status === 'active' ? (
        <button
          onClick={handleEnd}
          disabled={loading}
          className="text-xs px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
        >
          End
        </button>
      ) : null}
    </div>
  )
}
