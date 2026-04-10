'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Loader2, Check } from 'lucide-react'

const MONTHLY_PRICE_CENTS = 1500  // $15.00
const ANNUAL_PRICE_CENTS = 12900  // $129.00

const MEMBERSHIP_BENEFITS = [
  '50% off all e-books',
  'Early access to new releases',
  'Sweepstakes bonus entries',
  'Community & networking access',
  'Monthly expert sessions',
  'Cancel anytime',
]

interface PricingCardsProps {
  isActiveMember: boolean
  isLoggedIn: boolean
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function PricingCards({ isActiveMember, isLoggedIn }: PricingCardsProps) {
  const [plan, setPlan] = useState<'monthly' | 'annual'>('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleJoin = async () => {
    if (!isLoggedIn) {
      window.location.href = '/login?next=/pricing'
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/checkout/membership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start checkout. Please try again.')
        toast.error(data.error ?? 'Failed to start checkout. Please try again.')
        return
      }
      window.location.href = data.url
    } catch {
      setError('Something went wrong. Please try again.')
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const price = plan === 'monthly' ? MONTHLY_PRICE_CENTS : ANNUAL_PRICE_CENTS
  const perMonth = plan === 'annual' ? Math.round(ANNUAL_PRICE_CENTS / 12) : MONTHLY_PRICE_CENTS
  const annualSavings = MONTHLY_PRICE_CENTS * 12 - ANNUAL_PRICE_CENTS

  return (
    <div className="flex flex-col items-center gap-8">
      {/* Toggle */}
      <div className="flex items-center gap-3 rounded-full border p-1">
        <button
          type="button"
          onClick={() => setPlan('monthly')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            plan === 'monthly'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
          }`}
        >
          Monthly
        </button>
        <button
          type="button"
          onClick={() => setPlan('annual')}
          className={`rounded-full px-5 py-2 text-sm font-medium transition-colors ${
            plan === 'annual'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
          }`}
        >
          Annual
          {plan === 'annual' && (
            <span className="ml-2 text-xs text-emerald-400">Save ${(annualSavings / 100).toFixed(0)}</span>
          )}
        </button>
      </div>

      {plan === 'annual' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          Save ${(annualSavings / 100).toFixed(0)}/year vs monthly — that&apos;s ${(perMonth / 100).toFixed(2)}/month
        </p>
      )}

      {/* Card */}
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Omni Membership</h2>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            {plan === 'monthly' ? 'Monthly plan' : 'Annual plan — best value'}
          </p>
        </div>

        <div className="mb-6 flex items-baseline gap-2">
          <span className="text-5xl font-bold">{formatPrice(price)}</span>
          <span className="text-zinc-500">/{plan === 'monthly' ? 'month' : 'year'}</span>
        </div>

        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-300 italic">
          Start your free 7-day trial — cancel anytime
        </p>

        <ul className="mb-8 space-y-3">
          {MEMBERSHIP_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3 text-sm">
              <Check className="size-4 shrink-0 text-emerald-500" />
              {benefit}
            </li>
          ))}
        </ul>

        {isActiveMember ? (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-center">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              You&apos;re already a member!
            </p>
            <a
              href="/profile/subscription"
              className="mt-2 block text-sm text-emerald-600 dark:text-emerald-400 underline"
            >
              Manage your subscription
            </a>
          </div>
        ) : (
          <div>
            <Button
              onClick={handleJoin}
              disabled={loading}
              className="w-full"
              size="lg"
            >
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              {isLoggedIn ? 'Join Now — Free 7-Day Trial' : 'Sign In to Join'}
            </Button>
            {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
