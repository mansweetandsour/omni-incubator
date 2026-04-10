import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

const PAGE_SIZE = 12

interface EbookRow {
  id: string
  authors: string[]
  category: string
  tags: string[]
}

interface ProductRow {
  id: string
  slug: string
  title: string
  description: string | null
  price_cents: number
  cover_image_url: string | null
  ebooks: EbookRow[]
}

interface ProductCard {
  id: string
  slug: string
  title: string
  description: string | null
  price_cents: number
  cover_image_url: string | null
  ebook: {
    id: string
    authors: string[]
    category: string
  }
}

function parseCommaSeparated(value: string | null): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const q = searchParams.get('q')?.trim() ?? ''
  const categories = parseCommaSeparated(searchParams.get('category'))
  const operatorDeps = parseCommaSeparated(searchParams.get('operator_dependency'))
  const scalePotentials = parseCommaSeparated(searchParams.get('scale_potential'))
  const costsToStart = parseCommaSeparated(searchParams.get('cost_to_start'))
  const sort = searchParams.get('sort') ?? 'newest'

  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = adminClient
    .from('products')
    .select(
      'id, slug, title, description, price_cents, cover_image_url, ebooks!inner(id, authors, category, tags, operator_dependency, scale_potential, cost_to_start)',
      { count: 'exact' }
    )
    .eq('type', 'ebook')
    .eq('is_active', true)
    .is('deleted_at', null)

  // Apply ebook filters using foreign table column filters
  if (categories.length > 0) {
    query = query.in('ebooks.category', categories)
  }
  if (operatorDeps.length > 0) {
    query = query.in('ebooks.operator_dependency', operatorDeps)
  }
  if (scalePotentials.length > 0) {
    query = query.in('ebooks.scale_potential', scalePotentials)
  }
  if (costsToStart.length > 0) {
    query = query.in('ebooks.cost_to_start', costsToStart)
  }

  // Apply title + description search
  if (q) {
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  }

  // Apply sort
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

  // Apply pagination
  query = query.range(from, to)

  const { data: rawProducts, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let products = (rawProducts as unknown as ProductRow[]) ?? []

  // Tags search: filter in JS after DB query (PostgREST doesn't support ilike on array columns)
  if (q) {
    const lowerQ = q.toLowerCase()
    products = products.filter(
      (p) =>
        // Already filtered by title/description in DB, but also check tags
        p.title.toLowerCase().includes(lowerQ) ||
        (p.description ?? '').toLowerCase().includes(lowerQ) ||
        (p.ebooks[0]?.tags ?? []).some((t) => t.toLowerCase().includes(lowerQ))
    )
  }

  const total = count ?? 0
  const hasMore = from + products.length < total

  const productCards: ProductCard[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    price_cents: p.price_cents,
    cover_image_url: p.cover_image_url,
    ebook: {
      id: p.ebooks[0]?.id ?? '',
      authors: p.ebooks[0]?.authors ?? [],
      category: p.ebooks[0]?.category ?? '',
    },
  }))

  return NextResponse.json({ products: productCards, hasMore, total })
}
