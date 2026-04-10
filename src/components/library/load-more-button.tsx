'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ProductCard } from './product-card'

interface ProductCardData {
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

interface LoadMoreButtonProps {
  currentParams: string // serialized search params
  hasMore: boolean
  initialTotal: number
  initialCount: number
}

export function LoadMoreButton({
  currentParams,
  hasMore: initialHasMore,
  initialTotal,
  initialCount,
}: LoadMoreButtonProps) {
  const [products, setProducts] = useState<ProductCardData[]>([])
  const [loading, setLoading] = useState(false)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(2)

  const totalLoaded = initialCount + products.length

  async function loadMore() {
    setLoading(true)
    try {
      const params = new URLSearchParams(currentParams)
      params.set('page', String(page))
      const res = await fetch(`/api/library/products?${params.toString()}`)
      const data = await res.json() as { products: ProductCardData[]; hasMore: boolean; total: number }
      setProducts((prev) => [...prev, ...data.products])
      setHasMore(data.hasMore)
      setPage((p) => p + 1)
    } catch {
      // silently fail — user can retry
    } finally {
      setLoading(false)
    }
  }

  if (!hasMore && products.length === 0) return null

  return (
    <>
      {/* Render additional product cards */}
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}

      {hasMore && (
        <div className="col-span-full flex flex-col items-center gap-2 pt-4">
          <p className="text-sm text-zinc-500">
            Showing {totalLoaded} of {initialTotal}
          </p>
          <Button
            variant="outline"
            onClick={loadMore}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load More'}
          </Button>
        </div>
      )}
    </>
  )
}
