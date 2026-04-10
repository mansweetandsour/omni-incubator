'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

export function ManageSubscriptionBtn() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/subscription/portal', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to open billing portal')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={loading} variant="outline">
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        Manage Subscription
      </Button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
