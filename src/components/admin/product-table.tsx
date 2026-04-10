'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { archiveProduct } from '@/app/actions/products'
import { CATEGORY_LABELS } from '@/lib/utils/product-labels'

interface EbookData {
  id: string
  category: string
}

interface Product {
  id: string
  slug: string
  title: string
  price_cents: number
  is_active: boolean
  deleted_at: string | null
  created_at: string
  ebooks: EbookData | EbookData[]
}

interface ProductTableProps {
  products: Product[]
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function ProductTable({ products }: ProductTableProps) {
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleArchive(id: string) {
    setArchivingId(id)
    startTransition(async () => {
      const result = await archiveProduct(id)
      setArchivingId(null)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Product archived')
      }
    })
  }

  return (
    <div className="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {products.map((product) => {
          const ebook = Array.isArray(product.ebooks) ? product.ebooks[0] : product.ebooks
          const isArchived = !!product.deleted_at
          const category = ebook?.category ?? ''
          return (
            <TableRow key={product.id} className={isArchived ? 'opacity-60' : ''}>
              <TableCell className="font-medium max-w-xs truncate">{product.title}</TableCell>
              <TableCell>
                <Badge variant="secondary">
                  {CATEGORY_LABELS[category] ?? category}
                </Badge>
              </TableCell>
              <TableCell>{formatPrice(product.price_cents)}</TableCell>
              <TableCell>
                {isArchived ? (
                  <Badge variant="destructive">Archived</Badge>
                ) : product.is_active ? (
                  <Badge variant="default">Active</Badge>
                ) : (
                  <Badge variant="secondary">Inactive</Badge>
                )}
              </TableCell>
              <TableCell className="text-zinc-500 text-sm">
                {formatDate(product.created_at)}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Link href={`/admin/products/${product.id}/edit`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                  Edit
                </Link>
                {!isArchived && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={archivingId === product.id}
                    onClick={() => handleArchive(product.id)}
                  >
                    {archivingId === product.id ? '…' : 'Archive'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    </div>
  )
}
