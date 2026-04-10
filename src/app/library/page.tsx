import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { ProductCard } from '@/components/library/product-card'
import { FilterSidebar } from '@/components/library/filter-sidebar'
import { SearchInput } from '@/components/library/search-input'
import { SortSelect } from '@/components/library/sort-select'
import { LoadMoreButton } from '@/components/library/load-more-button'
import { Skeleton } from '@/components/ui/skeleton'

export const revalidate = 60

const PAGE_SIZE = 12

interface LibraryPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function getString(val: string | string[] | undefined): string {
  if (!val) return ''
  return Array.isArray(val) ? val[0] ?? '' : val
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const q = getString(params.q)
  const sort = getString(params.sort) || 'newest'
  const categoryParam = getString(params.category)
  const operatorParam = getString(params.operator_dependency)
  const scaleParam = getString(params.scale_potential)
  const costParam = getString(params.cost_to_start)

  const categories = categoryParam ? categoryParam.split(',').filter(Boolean) : []
  const operators = operatorParam ? operatorParam.split(',').filter(Boolean) : []
  const scales = scaleParam ? scaleParam.split(',').filter(Boolean) : []
  const costs = costParam ? costParam.split(',').filter(Boolean) : []

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select(
      'id, slug, title, description, price_cents, custom_entry_amount, cover_image_url, ebooks!inner(id, authors, category, tags, operator_dependency, scale_potential, cost_to_start)',
      { count: 'exact' }
    )
    .eq('type', 'ebook')
    .eq('is_active', true)
    .is('deleted_at', null)

  if (categories.length > 0) query = query.in('ebooks.category', categories)
  if (operators.length > 0) query = query.in('ebooks.operator_dependency', operators)
  if (scales.length > 0) query = query.in('ebooks.scale_potential', scales)
  if (costs.length > 0) query = query.in('ebooks.cost_to_start', costs)

  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  }

  switch (sort) {
    case 'price_asc':
      query = query.order('price_cents', { ascending: true })
      break
    case 'price_desc':
      query = query.order('price_cents', { ascending: false })
      break
    case 'title_asc':
      query = query.order('title', { ascending: true })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  query = query.range(0, PAGE_SIZE - 1)

  const { data: rawProducts, count } = await query

  interface EbookRow {
    id: string
    authors: string[]
    category: string
    tags: string[]
    operator_dependency: string | null
    scale_potential: string | null
    cost_to_start: string | null
  }

  interface ProductRow {
    id: string
    slug: string
    title: string
    description: string | null
    price_cents: number
    custom_entry_amount: number | null
    cover_image_url: string | null
    ebooks: EbookRow | EbookRow[]
  }

  let products = (rawProducts as unknown as ProductRow[]) ?? []

  // Tags search: JS-level filter after DB
  if (q) {
    const lowerQ = q.toLowerCase()
    products = products.filter((p) => {
      const ebook = Array.isArray(p.ebooks) ? p.ebooks[0] : p.ebooks
      return (
        p.title.toLowerCase().includes(lowerQ) ||
        (p.description ?? '').toLowerCase().includes(lowerQ) ||
        (ebook?.tags ?? []).some((t) => t.toLowerCase().includes(lowerQ))
      )
    })
  }

  const total = count ?? 0
  const hasMore = products.length === PAGE_SIZE && total > PAGE_SIZE

  // Fetch sweepstake data once for entry badges
  const [{ data: activeSweepstake }, { data: activeMultiplierRow }] = await Promise.all([
    adminClient.from('sweepstakes').select('id').eq('status', 'active').maybeSingle(),
    adminClient
      .from('entry_multipliers')
      .select('multiplier')
      .eq('is_active', true)
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const sweepData = activeSweepstake
    ? {
        hasActiveSweepstake: true,
        activeMultiplier: activeMultiplierRow ? Number(activeMultiplierRow.multiplier) : null,
      }
    : null

  // Build search params string for load-more
  const clientParams = new URLSearchParams()
  if (q) clientParams.set('q', q)
  if (sort !== 'newest') clientParams.set('sort', sort)
  if (categoryParam) clientParams.set('category', categoryParam)
  if (operatorParam) clientParams.set('operator_dependency', operatorParam)
  if (scaleParam) clientParams.set('scale_potential', scaleParam)
  if (costParam) clientParams.set('cost_to_start', costParam)

  const productCards = products.map((p) => {
    const ebook = Array.isArray(p.ebooks) ? p.ebooks[0] : p.ebooks
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      price_cents: p.price_cents,
      custom_entry_amount: p.custom_entry_amount ?? null,
      cover_image_url: p.cover_image_url,
      ebook: {
        id: ebook?.id ?? '',
        authors: ebook?.authors ?? [],
        category: ebook?.category ?? '',
      },
    }
  })

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-3xl font-bold mb-6">E-Book Library</h1>

      {/* Top bar: search + sort */}
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Suspense fallback={<Skeleton className="h-9 w-64" />}>
          <SearchInput defaultValue={q} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-9 w-36" />}>
          <SortSelect currentSort={sort} />
        </Suspense>
      </div>

      <div className="flex gap-8">
        {/* Filter sidebar */}
        <Suspense fallback={<Skeleton className="w-56 h-96" />}>
          <FilterSidebar />
        </Suspense>

        {/* Product grid */}
        <div className="flex-1">
          {productCards.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-zinc-500 text-lg">No e-books match your filters.</p>
              <Link
                href="/library"
                className="mt-3 inline-block text-sm text-zinc-400 underline hover:text-zinc-600"
              >
                Reset Filters
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {productCards.map((product) => (
                <ProductCard key={product.id} product={product} sweepData={sweepData} />
              ))}
              {hasMore && (
                <LoadMoreButton
                  currentParams={clientParams.toString()}
                  hasMore={hasMore}
                  initialTotal={total}
                  initialCount={productCards.length}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
