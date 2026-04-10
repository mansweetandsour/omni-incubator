import type { Metadata } from 'next'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { buttonVariants } from '@/components/ui/button'
import { ProductCard } from '@/components/library/product-card'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Omni Incubator',
  description: 'E-books, community, sweepstakes — everything you need to build.',
  alternates: { canonical: 'https://omniincubator.org' },
  openGraph: {
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
  },
}

export default async function HomePage() {
  // Query 1: active sweepstake
  const { data: activeSweepstake } = await adminClient
    .from('sweepstakes')
    .select('id, prize_description')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  // Query 2: featured ebooks
  const { data: featuredProducts } = await adminClient
    .from('products')
    .select('id, slug, title, description, price_cents, custom_entry_amount, cover_image_url, ebooks!inner(id, authors, category)')
    .eq('type', 'ebook')
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(3)

  return (
    <div>
      {/* Section 1 — Hero */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            Build, Launch, and Grow — Join the Omni Incubator
          </h1>
          <p className="text-lg md:text-xl text-zinc-500 mt-4 max-w-2xl mx-auto">
            Unlock premium e-books, earn sweepstakes entries, and grow your business — all in one membership.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-8">
            <Link href="/library" className={buttonVariants({ size: 'lg' })}>
              Browse the Library
            </Link>
            <Link href="/pricing" className={buttonVariants({ size: 'lg', variant: 'outline' })}>
              Join Now
            </Link>
          </div>
          <div className="mt-6">
            {activeSweepstake ? (
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                🎟️ Win {activeSweepstake.prize_description} — No purchase necessary
              </p>
            ) : (
              <p className="text-sm text-zinc-500">Enter our next sweepstake — coming soon</p>
            )}
          </div>
        </div>
      </section>

      {/* Section 2 — Featured E-books */}
      <section className="py-16 px-4 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">Featured E-books</h2>
          <p className="text-zinc-500 mb-8">Our most recent releases, hand-picked for you.</p>
          {featuredProducts && featuredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featuredProducts.map((p) => {
                const ebooksRaw = p.ebooks as { id: string; authors: string[]; category: string } | { id: string; authors: string[]; category: string }[]
                const ebookRow = Array.isArray(ebooksRaw) ? ebooksRaw[0] : ebooksRaw
                const product = {
                  id: p.id,
                  slug: p.slug,
                  title: p.title,
                  description: p.description ?? null,
                  price_cents: p.price_cents,
                  custom_entry_amount: (p.custom_entry_amount as number | null | undefined) ?? null,
                  cover_image_url: p.cover_image_url ?? null,
                  ebook: {
                    id: ebookRow?.id ?? '',
                    authors: ebookRow?.authors ?? [],
                    category: ebookRow?.category ?? '',
                  },
                }
                return <ProductCard key={p.id} product={product} sweepData={null} />
              })}
            </div>
          ) : (
            <p className="text-zinc-500">Check back soon for new releases.</p>
          )}
        </div>
      </section>

      {/* Section 3 — How It Works */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl">👋</div>
              <h3 className="font-semibold text-lg mt-3">Join</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Create your free account and explore our membership plans.
              </p>
            </div>
            <div>
              <div className="text-4xl">📚</div>
              <h3 className="font-semibold text-lg mt-3">Learn</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Access premium e-books on business models, growth, and operations — at 50% off as a member.
              </p>
            </div>
            <div>
              <div className="text-4xl">🏆</div>
              <h3 className="font-semibold text-lg mt-3">Win</h3>
              <p className="text-sm text-zinc-500 mt-1">
                Every purchase earns sweepstake entries. No purchase necessary — free entry options available.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4 — Membership Pitch */}
      <section className="py-16 px-4 bg-zinc-50 dark:bg-zinc-900/50">
        <div className="max-w-2xl mx-auto rounded-2xl border bg-white dark:bg-zinc-900 p-8 md:p-12 text-center shadow-sm">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Become a Member</h2>
          <p className="text-zinc-500 mb-6">
            Get 50% off all e-books, sweepstakes bonus entries, early access to new releases, and more.
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            50% off e-books · Sweepstakes entries · Community access · Cancel anytime
          </p>
          <p className="text-3xl font-bold mb-2">
            $15<span className="text-xl font-normal text-zinc-500">/mo</span>
          </p>
          <p className="text-sm text-zinc-400 mb-8">or $129/yr — save $51</p>
          <Link href="/pricing" className={buttonVariants({ size: 'lg' })}>
            Start Free Trial
          </Link>
          <p className="text-xs text-zinc-400 mt-3">
            7-day free trial. No credit card charge until trial ends.
          </p>
        </div>
      </section>

      {/* Section 5 — Newsletter Callout */}
      <section className="py-16 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">Join Our Monthly Newsletter</h2>
          <p className="text-zinc-500 mb-6 max-w-lg mx-auto">
            Member benefit: our monthly newsletter covers business ideas, e-book highlights, and member stories. Subscribe free with any membership.
          </p>
          <Link href="/pricing" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
            Get Membership Access
          </Link>
        </div>
      </section>
    </div>
  )
}
