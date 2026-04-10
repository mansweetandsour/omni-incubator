import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isActiveMember } from '@/lib/membership'
import { EbookDetail } from '@/components/ebook/ebook-detail'
import { EntryBadge } from '@/components/sweepstakes/EntryBadge'

export const revalidate = 0

interface EbookDetailPageProps {
  params: Promise<{ slug: string }>
}

export default async function EbookDetailPage({ params }: EbookDetailPageProps) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: product } = await supabase
    .from('products')
    .select('*, ebooks!inner(*)')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single()

  if (!product) notFound()

  // Normalize ebooks join
  const ebooksRaw = product.ebooks
  const ebook = Array.isArray(ebooksRaw) ? ebooksRaw[0] : ebooksRaw

  if (!ebook) notFound()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Ownership check
  let userOwnsEbook = false
  if (user) {
    const { data: ue } = await supabase
      .from('user_ebooks')
      .select('id')
      .eq('ebook_id', ebook.id)
      .eq('user_id', user.id)
      .maybeSingle()
    userOwnsEbook = !!ue
  }

  // Member check
  const isMember = user ? await isActiveMember(user.id) : false

  const productWithEbook = {
    ...product,
    ebooks: ebook,
  }

  return (
    <div>
      <div className="container mx-auto px-4 pt-6 pb-0 max-w-4xl">
        <Suspense fallback={null}>
          <EntryBadge
            product={{
              price_cents: product.price_cents,
              custom_entry_amount: (product as { custom_entry_amount?: number | null }).custom_entry_amount ?? null,
            }}
          />
        </Suspense>
        <p className="text-sm text-zinc-500 mt-1">
          Members earn {Math.floor(product.price_cents / 100)} entries (based on full $
          {(product.price_cents / 100).toFixed(2)} list price)
        </p>
      </div>
      <EbookDetail
        product={productWithEbook}
        userOwnsEbook={userOwnsEbook}
        ebookId={ebook.id}
        isMember={isMember}
        userId={user?.id ?? null}
      />
    </div>
  )
}
