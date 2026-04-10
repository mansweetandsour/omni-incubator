import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { EbookDetail } from '@/components/ebook/ebook-detail'

export const revalidate = 60

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

  // Ownership check
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const productWithEbook = {
    ...product,
    ebooks: ebook,
  }

  return <EbookDetail product={productWithEbook} userOwnsEbook={userOwnsEbook} />
}
