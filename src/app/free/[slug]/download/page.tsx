import { redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface DownloadPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ token?: string }>
}

export default async function SampleProductDownloadPage({
  params,
  searchParams,
}: DownloadPageProps) {
  const { slug } = await params
  const { token } = await searchParams

  if (!token) {
    redirect(`/free/${slug}`)
  }

  // Look up lead capture by token
  const { data: lead } = await adminClient
    .from('lead_captures')
    .select('id, confirmed_at, sample_product_id')
    .eq('confirmation_token', token)
    .maybeSingle()

  if (!lead) {
    redirect(`/free/${slug}`)
  }

  // Not yet confirmed — redirect to confirmation page
  if (!lead.confirmed_at) {
    redirect(`/confirm/${token}`)
  }

  // Fetch product by slug (must be active)
  const { data: product } = await adminClient
    .from('sample_products')
    .select('id, title, slug, description, cover_image_url, custom_entry_amount, upsell_product_id, upsell_membership, upsell_heading, upsell_body')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!product) {
    redirect(`/free/${slug}`)
  }

  // Verify token belongs to this product
  if (lead.sample_product_id !== product.id) {
    redirect(`/free/${slug}`)
  }

  // Calculate entry count
  const { data: entryRows } = await adminClient
    .from('sweepstake_entries')
    .select('total_entries')
    .eq('lead_capture_id', lead.id)

  let entryCount: number | null = null
  if (entryRows && entryRows.length > 0) {
    entryCount = entryRows.reduce((sum, r) => sum + (r.total_entries ?? 0), 0)
  } else {
    // Fall back to product config or active sweepstake
    if (product.custom_entry_amount) {
      entryCount = product.custom_entry_amount
    } else {
      const { data: activeSw } = await adminClient
        .from('sweepstakes')
        .select('non_purchase_entry_amount')
        .eq('status', 'active')
        .maybeSingle()
      entryCount = activeSw?.non_purchase_entry_amount ?? 0
    }
  }

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

  return (
    <div className="container mx-auto max-w-2xl py-12 px-4 space-y-10">
      {/* Header */}
      <section className="text-center space-y-4">
        <div className="text-4xl">🎉</div>
        <h1 className="text-3xl font-bold">You&apos;re confirmed!</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Your download is ready. Click the button below to get your free resource.
        </p>
      </section>

      {/* Product Card + Download */}
      <section className="rounded-lg border bg-card p-6 space-y-6">
        <div className="flex gap-4 items-start">
          {product.cover_image_url && (
            <Image
              src={product.cover_image_url}
              alt={product.title}
              width={100}
              height={140}
              className="rounded-md shadow object-cover flex-shrink-0"
            />
          )}
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{product.title}</h2>
            {product.description && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{product.description}</p>
            )}
            {entryCount !== null && entryCount > 0 && (
              <div className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                🎟️ {entryCount} sweepstake {entryCount === 1 ? 'entry' : 'entries'} earned
              </div>
            )}
          </div>
        </div>

        <a
          href={`/api/sample-products/${slug}/download?token=${token}`}
          className="flex w-full items-center justify-center rounded-lg bg-zinc-900 dark:bg-white px-6 py-3 text-sm font-semibold text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
        >
          ⬇️ Download {product.title}
        </a>
      </section>

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

      <div className="text-center">
        <Link href="/sweepstakes" className="text-sm text-blue-600 dark:text-blue-400 underline">
          View current sweepstake →
        </Link>
      </div>
    </div>
  )
}
