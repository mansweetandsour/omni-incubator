import type { Metadata } from 'next'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { CountdownTimer } from '@/components/sweepstakes/CountdownTimer'

export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const { data: activeSweepstake } = await adminClient
    .from('sweepstakes')
    .select('prize_description')
    .eq('status', 'active')
    .maybeSingle()
  if (activeSweepstake?.prize_description) {
    return {
      title: `Win ${activeSweepstake.prize_description} | Omni Incubator Sweepstakes`,
      description: `Enter for a chance to win ${activeSweepstake.prize_description}. No purchase necessary.`,
    }
  }
  return {
    title: 'Enter Our Sweepstakes',
    description: 'Enter Omni Incubator sweepstakes for a chance to win. No purchase necessary.',
  }
}

export default async function SweepstakesPage() {
  const [activeSweepstakeResult, drawnSweepstakesResult, sampleProductsResult] =
    await Promise.all([
      adminClient
        .from('sweepstakes')
        .select(
          'id, title, prize_amount_cents, prize_description, end_at, non_purchase_entry_amount'
        )
        .eq('status', 'active')
        .maybeSingle(),
      adminClient
        .from('sweepstakes')
        .select('id, prize_description, end_at, winner_user_id')
        .eq('status', 'drawn')
        .not('winner_user_id', 'is', null)
        .order('end_at', { ascending: false })
        .limit(5),
      adminClient
        .from('sample_products')
        .select('id, slug, title, custom_entry_amount')
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ])

  const activeSweepstake = activeSweepstakeResult.data
  const drawnSweepstakes = drawnSweepstakesResult.data ?? []
  const sampleProducts = sampleProductsResult.data ?? []

  // Fetch winner display names for drawn sweepstakes
  const winnerUserIds = drawnSweepstakes
    .map((sw) => sw.winner_user_id)
    .filter(Boolean) as string[]

  let winnerNames: Record<string, string> = {}
  if (winnerUserIds.length > 0) {
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, display_name')
      .in('id', winnerUserIds)
    winnerNames = Object.fromEntries(
      (profiles ?? []).map((p) => [p.id, p.display_name ?? 'Anonymous Winner'])
    )
  }

  if (!activeSweepstake) {
    return (
      <div className="container mx-auto max-w-3xl py-16 px-4 text-center space-y-4">
        <h1 className="text-3xl font-bold">Sweepstakes</h1>
        <p className="text-zinc-500 text-lg">
          Our next sweepstake is coming soon — check back soon!
        </p>
        <Link href="/sweepstakes/rules" className="text-sm text-blue-600 dark:text-blue-400 underline">
          View official rules →
        </Link>
      </div>
    )
  }

  const prizeDisplay = activeSweepstake.prize_amount_cents
    ? `$${(activeSweepstake.prize_amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
    : activeSweepstake.prize_description ?? 'Prize TBD'

  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 space-y-12">
      {/* Hero */}
      <section className="text-center space-y-6">
        <div className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-4 py-1.5 text-sm font-medium">
          🎟️ Now Open
        </div>
        <h1 className="text-4xl font-bold">{activeSweepstake.title}</h1>

        <div className="space-y-2">
          <p className="text-5xl font-black text-amber-600 dark:text-amber-400">{prizeDisplay}</p>
          {activeSweepstake.prize_description && activeSweepstake.prize_amount_cents && (
            <p className="text-zinc-500">{activeSweepstake.prize_description}</p>
          )}
        </div>

        <div className="flex items-center justify-center gap-3 text-lg">
          <span className="text-zinc-500">Ends in:</span>
          <CountdownTimer
            endAt={activeSweepstake.end_at}
            className="font-mono font-bold text-zinc-800 dark:text-zinc-200 text-xl"
          />
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white px-6 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
          >
            Enter Now
          </Link>
          <Link
            href="/sweepstakes/rules"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 px-6 text-sm font-semibold hover:bg-muted transition-colors"
          >
            Official Rules
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="space-y-6">
        <h2 className="text-2xl font-bold text-center">How to Earn Entries</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border p-5 space-y-2 text-center">
            <div className="text-3xl">📚</div>
            <h3 className="font-semibold">Purchase E-books</h3>
            <p className="text-sm text-zinc-500">
              Each e-book purchase earns entries based on the purchase price.
            </p>
          </div>
          <div className="rounded-lg border p-5 space-y-2 text-center">
            <div className="text-3xl">📧</div>
            <h3 className="font-semibold">Free Downloads</h3>
            <p className="text-sm text-zinc-500">
              Download free resources and confirm your email to earn{' '}
              {activeSweepstake.non_purchase_entry_amount} entries.
            </p>
          </div>
          <div className="rounded-lg border p-5 space-y-2 text-center">
            <div className="text-3xl">👑</div>
            <h3 className="font-semibold">Become a Member</h3>
            <p className="text-sm text-zinc-500">
              Members earn bonus entry multipliers on every purchase.
            </p>
          </div>
        </div>
      </section>

      {/* Free Resources */}
      {sampleProducts.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Free Resources (Earn Entries)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {sampleProducts.map((sp) => (
              <Link
                key={sp.id}
                href={`/free/${sp.slug}`}
                className="rounded-lg border p-4 hover:bg-muted/50 transition-colors group"
              >
                <p className="font-semibold group-hover:underline">{sp.title}</p>
                <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                  🎟️ +{sp.custom_entry_amount ?? activeSweepstake.non_purchase_entry_amount} entries
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Past Winners */}
      {drawnSweepstakes.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Past Winners</h2>
          <ul className="space-y-2">
            {drawnSweepstakes.map((sw) => (
              <li key={sw.id} className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">
                    {winnerNames[sw.winner_user_id ?? ''] ?? 'Anonymous Winner'}
                  </p>
                  <p className="text-sm text-zinc-500">{sw.prize_description ?? 'Prize'}</p>
                </div>
                <p className="text-sm text-zinc-400">
                  {new Date(sw.end_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="text-center text-sm text-zinc-400">
        <Link href="/sweepstakes/rules" className="underline hover:text-zinc-600">
          Official Rules & No Purchase Necessary
        </Link>
      </div>
    </div>
  )
}
