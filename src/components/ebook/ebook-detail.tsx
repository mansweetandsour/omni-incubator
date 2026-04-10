'use client'

import { useState } from 'react'
import Image from 'next/image'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { PreviewDownloadButton } from './preview-download-button'
import {
  CATEGORY_LABELS,
  OPERATOR_LABELS,
  SCALE_LABELS,
  COST_LABELS,
} from '@/lib/utils/product-labels'

interface EbookDetailData {
  id: string
  file_path: string
  preview_file_path: string | null
  authors: string[]
  category: string
  subcategory: string | null
  operator_dependency: string | null
  scale_potential: string | null
  cost_to_start: string | null
  tags: string[]
}

interface ProductDetailData {
  id: string
  slug: string
  title: string
  description: string | null
  long_description: string | null
  price_cents: number
  member_price_cents: number
  is_coming_soon: boolean
  cover_image_url: string | null
  ebooks: EbookDetailData
}

interface EbookDetailProps {
  product: ProductDetailData
  userOwnsEbook: boolean
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

export function EbookDetail({ product, userOwnsEbook }: EbookDetailProps) {
  const [membershipChecked, setMembershipChecked] = useState(false)
  const ebook = product.ebooks

  const authors = ebook.authors.length > 0 ? ebook.authors.join(', ') : 'Unknown'
  const category = CATEGORY_LABELS[ebook.category] ?? ebook.category
  const operatorLabel = ebook.operator_dependency
    ? (OPERATOR_LABELS[ebook.operator_dependency] ?? ebook.operator_dependency)
    : null
  const scaleLabel = ebook.scale_potential
    ? (SCALE_LABELS[ebook.scale_potential] ?? ebook.scale_potential)
    : null
  const costLabel = ebook.cost_to_start
    ? (COST_LABELS[ebook.cost_to_start] ?? ebook.cost_to_start)
    : null

  const hasPreview = ebook.preview_file_path && ebook.preview_file_path !== ''

  return (
    <div className="container mx-auto py-12 px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Left: Cover */}
        <div className="md:col-span-1">
          <div className="relative w-full rounded-lg overflow-hidden shadow-md" style={{ paddingBottom: '133.33%' }}>
            {product.cover_image_url ? (
              <Image
                src={product.cover_image_url}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-zinc-200 to-zinc-300 dark:from-zinc-700 dark:to-zinc-800 flex items-center justify-center">
                <span className="text-zinc-400 font-medium">No Cover</span>
              </div>
            )}
          </div>
        </div>

        {/* Right: Details */}
        <div className="md:col-span-2 space-y-6">
          {/* Title + authors */}
          <div>
            <Badge variant="secondary" className="mb-2">
              {category}
            </Badge>
            <h1 className="text-3xl font-bold">{product.title}</h1>
            <p className="mt-1 text-zinc-500">by {authors}</p>
          </div>

          {/* Short description */}
          {product.description && (
            <p className="text-zinc-700 dark:text-zinc-300">{product.description}</p>
          )}

          {/* Metadata */}
          {(operatorLabel || scaleLabel || costLabel) && (
            <div className="flex flex-wrap gap-3">
              {operatorLabel && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium">
                  {operatorLabel}
                </span>
              )}
              {scaleLabel && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium">
                  Scale: {scaleLabel}
                </span>
              )}
              {costLabel && (
                <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-3 py-1 text-xs font-medium">
                  Cost: {costLabel}
                </span>
              )}
            </div>
          )}

          {/* Tags */}
          {ebook.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ebook.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Price section */}
          <div className="rounded-lg border p-5 space-y-3 bg-zinc-50 dark:bg-zinc-900">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold">{formatPrice(product.price_cents)}</span>
              <span className="text-sm text-zinc-500">full price</span>
            </div>
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
              Members: {formatPrice(product.member_price_cents)} — 50% off
            </p>

            {/* Entry badge */}
            <span className="inline-block text-xs text-zinc-500 italic">
              Earn entries with purchase
            </span>

            {/* Ownership note */}
            {userOwnsEbook && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                You already own this e-book.
              </p>
            )}

            {/* Preview button */}
            {hasPreview && (
              <PreviewDownloadButton productId={product.id} />
            )}

            {/* Buy button (placeholder) */}
            <button
              type="button"
              disabled
              className="w-full rounded-md bg-zinc-900 dark:bg-white px-4 py-3 text-sm font-semibold text-white dark:text-zinc-900 opacity-50 cursor-not-allowed"
            >
              Buy — {formatPrice(product.price_cents)} (Coming Soon)
            </button>

            {/* Membership upsell */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={membershipChecked}
                onChange={(e) => setMembershipChecked(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300"
              />
              <span className="text-sm text-zinc-600 dark:text-zinc-300">
                Also join Omni Membership (+$15/mo, 7-day free trial)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Long description (markdown) */}
      {product.long_description && (
        <div className="mt-12 max-w-3xl">
          <h2 className="text-xl font-bold mb-4">About This E-book</h2>
          <div className="prose prose-zinc dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {product.long_description}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  )
}
