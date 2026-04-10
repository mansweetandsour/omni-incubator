import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'My Entries',
  robots: { index: false },
}
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'E-book Purchase',
  non_purchase_capture: 'Free Entry',
  admin_adjustment: 'Admin Adjustment',
  coupon_bonus: 'Coupon Bonus',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function ProfileEntriesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/profile/entries')
  }

  const userId = user.id

  // Fetch active sweepstake
  const { data: activeSweepstake } = await adminClient
    .from('sweepstakes')
    .select('id, title, prize_amount_cents, prize_description, end_at, non_purchase_entry_amount')
    .eq('status', 'active')
    .maybeSingle()

  if (!activeSweepstake) {
    // Fetch active sample products for CTA
    const { data: sampleProducts } = await adminClient
      .from('sample_products')
      .select('id, slug, title')
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    return (
      <div className="container mx-auto max-w-2xl py-12 px-4 space-y-6">
        <h1 className="text-3xl font-bold">My Sweepstake Entries</h1>
        <div className="rounded-lg border p-8 text-center space-y-4">
          <p className="text-xl font-medium">No active sweepstake right now</p>
          <p className="text-zinc-500">
            Check back soon! In the meantime, you can download free resources to earn entries
            when the next sweepstake opens.
          </p>
          {(sampleProducts ?? []).length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Free Resources:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {(sampleProducts ?? []).map((sp) => (
                  <Link
                    key={sp.id}
                    href={`/free/${sp.slug}`}
                    className="rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                  >
                    {sp.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  const [verificationResult, historyResult, sampleProductsResult] = await Promise.all([
    adminClient
      .from('entry_verification')
      .select(
        'total_entries, purchase_entries, non_purchase_entries, admin_entries, coupon_bonus_entries'
      )
      .eq('user_id', userId)
      .eq('sweepstake_id', activeSweepstake.id)
      .maybeSingle(),
    adminClient
      .from('sweepstake_entries')
      .select('created_at, source, total_entries, notes')
      .eq('user_id', userId)
      .eq('sweepstake_id', activeSweepstake.id)
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('sample_products')
      .select('id, slug, title')
      .eq('is_active', true)
      .order('created_at', { ascending: false }),
  ])

  const stats = verificationResult.data ?? {
    total_entries: 0,
    purchase_entries: 0,
    non_purchase_entries: 0,
    admin_entries: 0,
    coupon_bonus_entries: 0,
  }

  const entryHistory = historyResult.data ?? []
  const sampleProducts = sampleProductsResult.data ?? []

  const prizeDisplay = activeSweepstake.prize_amount_cents
    ? `$${(activeSweepstake.prize_amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    : activeSweepstake.prize_description ?? activeSweepstake.title

  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 space-y-10">
      <h1 className="text-3xl font-bold">My Sweepstake Entries</h1>

      {/* Active Sweepstake Banner */}
      <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 p-6 space-y-1">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Active Sweepstake</p>
        <p className="text-xl font-bold">{activeSweepstake.title}</p>
        <p className="text-amber-600 dark:text-amber-400 font-semibold">{prizeDisplay}</p>
      </div>

      {/* Total Entries */}
      <div className="text-center space-y-2">
        <p className="text-7xl font-black text-zinc-900 dark:text-zinc-100">
          {stats.total_entries.toLocaleString()}
        </p>
        <p className="text-lg text-zinc-500 font-medium">Total Entries</p>
      </div>

      {/* Entry Breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.purchase_entries}</p>
          <p className="text-xs text-zinc-500 mt-1">Purchase</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.non_purchase_entries}</p>
          <p className="text-xs text-zinc-500 mt-1">Free Entry</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.admin_entries}</p>
          <p className="text-xs text-zinc-500 mt-1">Admin</p>
        </div>
        <div className="rounded-lg border p-4 text-center">
          <p className="text-2xl font-bold">{stats.coupon_bonus_entries}</p>
          <p className="text-xs text-zinc-500 mt-1">Coupon Bonus</p>
        </div>
      </div>

      {/* Entry History */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Entry History</h2>
        {entryHistory.length === 0 ? (
          <p className="text-zinc-500">No entries yet for this sweepstake.</p>
        ) : (
          <div className="space-y-2">
            {entryHistory.map((entry, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border p-4 text-sm"
              >
                <div>
                  <p className="font-medium">{SOURCE_LABELS[entry.source] ?? entry.source}</p>
                  {entry.source === 'admin_adjustment' && entry.notes && (
                    <p className="text-xs text-zinc-400 mt-0.5">{entry.notes}</p>
                  )}
                  <p className="text-xs text-zinc-400 mt-0.5">{formatDate(entry.created_at)}</p>
                </div>
                <span
                  className={`font-bold text-base ${
                    entry.total_entries >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {entry.total_entries >= 0 ? '+' : ''}
                  {entry.total_entries}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Earn More Entries</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/library"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white px-4 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Browse E-books
          </Link>
          {sampleProducts.slice(0, 3).map((sp) => (
            <Link
              key={sp.id}
              href={`/free/${sp.slug}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 px-4 text-sm font-medium hover:bg-muted transition-colors"
            >
              Free: {sp.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
