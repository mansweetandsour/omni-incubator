import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'My Subscription',
  robots: { index: false },
}
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { ManageSubscriptionBtn } from '@/components/billing/manage-subscription-btn'

export const dynamic = 'force-dynamic'

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default'
    case 'trialing':
      return 'secondary'
    case 'past_due':
      return 'destructive'
    case 'canceled':
      return 'outline'
    default:
      return 'outline'
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default async function SubscriptionPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware protects this route
  if (!user) return null

  const { data } = await adminClient
    .from('subscriptions')
    .select('status, current_period_end, trial_end, cancel_at_period_end, products!inner(title)')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active', 'past_due', 'canceled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const products = data ? (data.products as unknown as { title: string } | null) : null

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4">
      <h1 className="mb-8 text-3xl font-bold">Subscription</h1>

      {!data ? (
        <div className="rounded-lg border p-8 text-center">
          <p className="text-zinc-500 mb-4">You don&apos;t have an active membership yet.</p>
          <Link
            href="/pricing"
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            View Pricing
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-500">Plan</p>
              <p className="font-semibold">{products?.title ?? 'Omni Membership'}</p>
            </div>
            <Badge variant={statusVariant(data.status)} className="capitalize">
              {data.status === 'past_due' ? 'Past Due' : data.status}
            </Badge>
          </div>

          {data.status === 'trialing' && data.trial_end && (
            <div className="rounded-md bg-zinc-50 dark:bg-zinc-900 border px-4 py-3">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">Free trial ends:</span>{' '}
                {formatDate(data.trial_end)}
              </p>
            </div>
          )}

          {data.current_period_end && data.status !== 'canceled' && (
            <div>
              <p className="text-sm text-zinc-500">Next billing date</p>
              <p className="font-medium">{formatDate(data.current_period_end)}</p>
            </div>
          )}

          {data.cancel_at_period_end && (
            <div className="rounded-md border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
              <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                Your subscription will cancel at the end of the current billing period (
                {formatDate(data.current_period_end)}).
              </p>
            </div>
          )}

          {data.status === 'past_due' && (
            <div className="rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                Your last payment failed. Please update your payment method to keep your membership active.
              </p>
            </div>
          )}

          <ManageSubscriptionBtn />
        </div>
      )}
    </div>
  )
}
