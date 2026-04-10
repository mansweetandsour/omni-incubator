'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { toggleCoupon } from '@/app/(admin)/admin/sweepstakes/actions'

interface CouponToggleProps {
  id: string
  isActive: boolean
}

export function CouponToggle({ id, isActive }: CouponToggleProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(isActive)

  async function handleToggle() {
    setLoading(true)
    const result = await toggleCoupon(id, !active)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      setActive(!active)
      router.refresh()
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className={`text-xs px-2 py-0.5 rounded font-medium disabled:opacity-50 ${
        active
          ? 'bg-green-100 text-green-700 hover:bg-green-200'
          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
      }`}
    >
      {active ? 'Active' : 'Inactive'}
    </button>
  )
}
