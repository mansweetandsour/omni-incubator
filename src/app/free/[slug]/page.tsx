import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import type { Metadata } from 'next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { adminClient } from '@/lib/supabase/admin'
import { LeadCaptureFormFree } from '@/components/free/LeadCaptureFormFree'
import { CountdownTimer } from '@/components/sweepstakes/CountdownTimer'

export const revalidate = 60

interface FreeProductPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: FreeProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const { data: product } = await adminClient
    .from('sample_products')
    .select('title, description, cover_image_url')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!product) return { title: 'Free Resource' }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://omniincubator.org'

  return {
    title: product.title,
    description: product.description ?? '',
    openGraph: {
      title: product.title,
      description: product.description ?? '',
      images: product.cover_image_url ? [{ url: product.cover_image_url }] : [],
      url: `${siteUrl}/free/${slug}`,
    },
    alternates: {
      canonical: `${siteUrl}/free/${slug}`,
    },
  }
}

export default async function FreeProductPage({ params }: FreeProductPageProps) {
  const { slug } = await params

  const [productResult, sweepstakeResult] = await Promise.all([
    adminClient
      .from('sample_products')
      .select('id, title, slug, description, long_description, require_phone, cover_image_url, custom_entry_amount, upsell_product_id, upsell_membership, upsell_heading, upsell_body')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle(),
    adminClient
      .from('sweepstakes')
      .select('id, prize_amount_cents, prize_description, non_purchase_entry_amount, end_at, title')
      .eq('status', 'active')
      .maybeSingle(),
  ])

  if (!productResult.data) notFound()

  const product = productResult.data
  const sweepstake = sweepstakeResult.data

  // Fetch upsell product if set
  let upsellProduct: {
    id: string
    slug: string
    title: string
    price_cents: number
    member_price_cents: number | null
    custom_entry_amount: number | null
    cover_image_url: string | null
  } | null = null

  if (product.upsell_product_id) {
    const { data } = await adminClient
      .from('products')
      .select('id, slug, title, price_cents, member_price_cents, custom_entry_amount, cover_image_url')
      .eq('id', product.upsell_product_id)
      .maybeSingle()
    upsellProduct = data
  }

  const entryCount =
    product.custom_entry_amount ?? sweepstake?.non_purchase_entry_amount ?? null

  return (
    <div className="container mx-auto max-w-3xl py-12 px-4 space-y-12">
      {/* Hero */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          {product.cover_image_url && (
            <div className="flex-shrink-0">
              <Image
                src={product.cover_image_url}
                alt={product.title}
                width={200}
                height={280}
                className="rounded-lg shadow-md object-cover"
              />
            </div>
          )}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold">{product.title}</h1>
            {product.description && (
              <p className="text-lg text-zinc-600 dark:text-zinc-400">{product.description}</p>
            )}
            {entryCount !== null && sweepstake && (
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                🎟️ Download and earn <strong>{entryCount} sweepstake entries</strong>!
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Lead Capture Form */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Get Free Access</h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Enter your email to receive a download link.
        </p>
        <LeadCaptureFormFree
          productId={product.id}
          requirePhone={product.require_phone}
        />
      </section>

      {/* Long Description */}
      {product.long_description && (
        <section>
          <div className="prose prose-zinc max-w-none dark:prose-invert">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {product.long_description}
            </ReactMarkdown>
          </div>
        </section>
      )}

      {/* Upsell Section */}
      {(upsellProduct || product.upsell_membership) && (
        <section className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-xl font-semibold">
            {product.upsell_heading ?? 'Want more resources like this?'}
          </h2>
          {product.upsell_body && (
            <p className="text-zinc-600 dark:text-zinc-400">{product.upsell_body}</p>
          )}
          <div className="flex flex-col sm:flex-row gap-4">
            {upsellProduct && (
              <Link
                href={`/library/${upsellProduct.slug}`}
                className="flex-1 rounded-lg border p-4 hover:bg-muted/50 transition-colors group"
              >
                <div className="flex gap-4">
                  {upsellProduct.cover_image_url && (
                    <Image
                      src={upsellProduct.cover_image_url}
                      alt={upsellProduct.title}
                      width={60}
                      height={84}
                      className="rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div>
                    <p className="font-semibold group-hover:underline">{upsellProduct.title}</p>
                    <p className="text-sm text-zinc-500">
                      ${(upsellProduct.price_cents / 100).toFixed(2)}
                    </p>
                    {upsellProduct.custom_entry_amount && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        +{upsellProduct.custom_entry_amount} entries
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            )}
            {product.upsell_membership && (
              <Link
                href="/pricing"
                className="flex-1 rounded-lg border bg-primary/5 dark:bg-primary/10 p-4 hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors group"
              >
                <p className="font-semibold group-hover:underline">Become a Member</p>
                <p className="text-sm text-zinc-500 mt-1">
                  Get access to all e-books + sweepstake multipliers
                </p>
              </Link>
            )}
          </div>
        </section>
      )}

      {/* Sweepstake Info */}
      {sweepstake && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-6 space-y-3">
          <h2 className="text-xl font-semibold">🎟️ Current Sweepstake</h2>
          <p className="font-bold text-2xl">
            {sweepstake.prize_amount_cents
              ? `$${(sweepstake.prize_amount_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`
              : sweepstake.prize_description ?? sweepstake.title}
          </p>
          {sweepstake.prize_description && sweepstake.prize_amount_cents && (
            <p className="text-zinc-600 dark:text-zinc-400">{sweepstake.prize_description}</p>
          )}
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <span>Ends in:</span>
            <CountdownTimer endAt={sweepstake.end_at} className="font-mono font-medium text-zinc-700 dark:text-zinc-300" />
          </div>
          <Link
            href="/sweepstakes"
            className="inline-block text-sm text-blue-600 dark:text-blue-400 underline"
          >
            View sweepstakes rules →
          </Link>
        </section>
      )}
    </div>
  )
}
