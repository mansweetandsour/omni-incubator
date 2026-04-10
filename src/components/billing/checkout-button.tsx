'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface CheckoutButtonProps {
  ebookId: string
  userId: string | null
  slug: string
  isMember?: boolean
  withMembership?: boolean
  couponCode?: string
  label?: string
  className?: string
}

export function CheckoutButton({
  ebookId,
  userId,
  slug,
  isMember = false,
  withMembership = false,
  couponCode,
  label,
  className,
}: CheckoutButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!userId) {
    return (
      <a
        href={`/login?next=/library/${slug}`}
        className="block w-full rounded-md bg-zinc-900 dark:bg-white px-4 py-3 text-center text-sm font-semibold text-white dark:text-zinc-900 hover:opacity-90 transition-opacity"
      >
        Sign in to Buy
      </a>
    )
  }

  const handleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      const endpoint = withMembership
        ? '/api/checkout/ebook-with-membership'
        : '/api/checkout/ebook'

      const body: Record<string, string> = { ebookId }
      if (couponCode) body.couponCode = couponCode

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Checkout failed. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const buttonLabel = label ?? (withMembership ? 'Buy + Join Membership' : isMember ? 'Buy (Member Price)' : 'Buy Now')

  return (
    <div className={className}>
      <Button
        onClick={handleClick}
        disabled={loading}
        className="w-full"
      >
        {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
        {buttonLabel}
      </Button>
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
    </div>
  )
}
