import type { Metadata } from 'next'
import Image from 'next/image'

export const metadata: Metadata = {
  title: 'My E-books',
  robots: { index: false },
}
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { DownloadButton } from '@/components/billing/download-button'

export const dynamic = 'force-dynamic'

export default async function MyEbooksPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware protects this route
  if (!user) return null

  const { data } = await adminClient
    .from('user_ebooks')
    .select('ebook_id, created_at, ebooks!inner(id, authors, products!inner(id, title, cover_image_url, slug))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  type EbookRow = NonNullable<typeof data>[0]
  // Deduplicate by ebook_id
  const seen = new Map<string, EbookRow>()
  for (const row of data ?? []) {
    if (!seen.has(row.ebook_id)) {
      seen.set(row.ebook_id, row)
    }
  }
  const ebooks = Array.from(seen.values())

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4">
      <h1 className="mb-8 text-3xl font-bold">My E-books</h1>

      {ebooks.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-zinc-500">
          You haven&apos;t purchased any e-books yet.{' '}
          <a href="/library" className="text-primary underline">
            Browse the library
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6">
          {ebooks.map((row) => {
            const ebook = row.ebooks as unknown as {
              id: string
              authors: string[]
              products: {
                id: string
                title: string
                cover_image_url: string | null
                slug: string
              }
            }
            const product = ebook.products

            return (
              <div key={row.ebook_id} className="flex flex-col gap-3">
                <a href={`/library/${product.slug}`} className="group block">
                  <div
                    className="relative w-full rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow"
                    style={{ paddingBottom: '133.33%' }}
                  >
                    {product.cover_image_url ? (
                      <Image
                        src={product.cover_image_url}
                        alt={product.title}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
                        <span className="text-zinc-400 text-xs font-medium text-center px-2">
                          {product.title}
                        </span>
                      </div>
                    )}
                  </div>
                </a>
                <div className="space-y-1">
                  <p className="text-sm font-medium leading-tight line-clamp-2">{product.title}</p>
                  {ebook.authors.length > 0 && (
                    <p className="text-xs text-zinc-500">{ebook.authors[0]}</p>
                  )}
                  <DownloadButton ebookId={ebook.id} label="Download" className="w-full text-xs" />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
