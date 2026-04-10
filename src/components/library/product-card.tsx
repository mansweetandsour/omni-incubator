import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { CATEGORY_LABELS } from '@/lib/utils/product-labels'

interface ProductCardEbook {
  id: string
  authors: string[]
  category: string
}

interface ProductCardProps {
  product: {
    id: string
    slug: string
    title: string
    description: string | null
    price_cents: number
    custom_entry_amount?: number | null
    cover_image_url: string | null
    ebook: ProductCardEbook
  }
  sweepData?: {
    hasActiveSweepstake: boolean
    activeMultiplier: number | null
  } | null
  priority?: boolean
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function ProductCard({ product, sweepData, priority = false }: ProductCardProps) {
  const authors =
    product.ebook.authors.length > 0 ? product.ebook.authors.join(', ') : 'Unknown'
  const category = CATEGORY_LABELS[product.ebook.category] ?? product.ebook.category

  return (
    <Link
      href={`/library/${product.slug}`}
      className="group block rounded-lg border bg-white dark:bg-zinc-900 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Cover image — 3:4 aspect ratio */}
      <div className="relative w-full" style={{ paddingBottom: '133.33%' }}>
        {product.cover_image_url ? (
          <Image
            src={product.cover_image_url}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            className="object-cover"
            priority={priority}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
            <span className="text-zinc-400 text-sm font-medium">No Cover</span>
          </div>
        )}
      </div>

      {/* Card content */}
      <div className="p-4 space-y-2">
        <Badge variant="secondary" className="text-xs">
          {category}
        </Badge>
        <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:underline">
          {product.title}
        </h3>
        <p className="text-xs text-zinc-500">{authors}</p>
        <div className="flex items-center justify-between pt-1">
          <span className="font-bold text-sm">{formatPrice(product.price_cents)}</span>
          {sweepData?.hasActiveSweepstake && (() => {
            const base = product.custom_entry_amount ?? Math.floor(product.price_cents / 100)
            if (sweepData.activeMultiplier) {
              const earned = Math.floor(base * sweepData.activeMultiplier)
              return <span className="text-xs font-semibold text-orange-600">🔥 {sweepData.activeMultiplier}X — {earned} entries</span>
            }
            return <span className="text-xs font-medium text-zinc-500">🎟️ {base} entries</span>
          })()}
        </div>
      </div>
    </Link>
  )
}
