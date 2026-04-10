import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { isActiveMember } from '@/lib/membership'
import { PricingCards } from '@/components/billing/pricing-cards'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Membership Plans',
  description: 'Join Omni Incubator and unlock 50% off all e-books, sweepstakes entries, and more. Start with a free 7-day trial.',
}

export default async function PricingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let activeMember = false
  if (user) {
    activeMember = await isActiveMember(user.id)
  }

  return (
    <div className="container mx-auto max-w-4xl py-16 px-4">
      <div className="mb-12 text-center">
        <h1 className="text-4xl font-bold">Membership Pricing</h1>
        <p className="mt-4 text-lg text-zinc-500 dark:text-zinc-400 max-w-xl mx-auto">
          Join Omni Incubator and unlock 50% off all e-books, sweepstakes entries, and more.
          Start with a free 7-day trial — no credit card charge until the trial ends.
        </p>
      </div>

      <PricingCards isActiveMember={activeMember} isLoggedIn={!!user} />

      <div className="mt-12 text-center text-xs text-zinc-400">
        Prices in USD. Membership auto-renews. Cancel anytime from your profile.
      </div>
    </div>
  )
}
