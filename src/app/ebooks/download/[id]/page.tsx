import { redirect, notFound } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { DownloadButton } from '@/components/billing/download-button'

export const dynamic = 'force-dynamic'

interface DownloadPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ checkout?: string }>
}

export default async function EbookDownloadPage({ params, searchParams }: DownloadPageProps) {
  const { id } = await params
  const { checkout } = await searchParams

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect(`/login?next=/ebooks/download/${id}`)
  }

  // Fetch ebook + product metadata
  const { data: ebook } = await adminClient
    .from('ebooks')
    .select('id, authors, products!inner(id, title, description, cover_image_url, slug)')
    .eq('id', id)
    .single()

  if (!ebook) notFound()

  const product = (ebook.products as unknown) as {
    id: string
    title: string
    description: string | null
    cover_image_url: string | null
    slug: string
  }

  // Check ownership
  const { data: ownership } = await adminClient
    .from('user_ebooks')
    .select('id')
    .eq('ebook_id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  const isCheckoutSuccess = checkout === 'success'

  return (
    <div className="container mx-auto max-w-2xl py-16 px-4">
      {isCheckoutSuccess && (
        <div className="mb-8 rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-900/20 p-4">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">
            Purchase successful! Your e-book is ready to download.
          </p>
        </div>
      )}

      <div className="flex gap-8">
        {/* Cover */}
        <div className="shrink-0 w-32">
          <div className="relative w-full rounded-lg overflow-hidden shadow-md" style={{ paddingBottom: '133.33%' }}>
            {product.cover_image_url ? (
              <Image
                src={product.cover_image_url}
                alt={product.title}
                fill
                sizes="128px"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
                <span className="text-zinc-400 text-xs font-medium">No Cover</span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-2xl font-bold">{product.title}</h1>
            {(ebook.authors as string[]).length > 0 && (
              <p className="mt-1 text-zinc-500 text-sm">
                by {(ebook.authors as string[]).join(', ')}
              </p>
            )}
          </div>

          {product.description && (
            <p className="text-zinc-600 dark:text-zinc-300 text-sm">{product.description}</p>
          )}

          {ownership ? (
            <DownloadButton ebookId={id} label="Download E-book" className="mt-4" />
          ) : (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-700 dark:text-red-300">
                You do not own this e-book.{' '}
                <a href={`/library/${product.slug}`} className="underline">
                  View in library
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
