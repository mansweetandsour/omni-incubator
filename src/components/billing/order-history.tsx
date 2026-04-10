'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'

interface OrderItem {
  id: string
  product_id: string | null
  product_title: string | null
  quantity: number
  unit_price_cents: number
}

interface Order {
  id: string
  order_number: string | null
  created_at: string
  total_cents: number
  status: string
  order_items: OrderItem[]
}

interface OrderHistoryProps {
  initialOrders: Order[]
  total: number
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

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default'
    case 'pending':
      return 'secondary'
    case 'refunded':
      return 'outline'
    case 'failed':
      return 'destructive'
    default:
      return 'outline'
  }
}

export function OrderHistory({ initialOrders, total }: OrderHistoryProps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(initialOrders.length < total)
  const [loadingMore, setLoadingMore] = useState(false)

  const toggleRow = (orderId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(orderId)) {
        next.delete(orderId)
      } else {
        next.add(orderId)
      }
      return next
    })
  }

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const nextPage = page + 1
      const res = await fetch(`/api/profile/orders?page=${nextPage}`)
      const data = await res.json()
      if (res.ok) {
        setOrders((prev) => [...prev, ...data.orders])
        setHasMore(data.hasMore)
        setPage(nextPage)
      }
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false)
    }
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-zinc-500">
        No orders yet. Browse the{' '}
        <a href="/library" className="text-primary underline">
          library
        </a>{' '}
        to find e-books.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Order #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <>
              <TableRow
                key={order.id}
                className="cursor-pointer"
                onClick={() => toggleRow(order.id)}
              >
                <TableCell>
                  {expandedRows.has(order.id) ? (
                    <ChevronDown className="size-4 text-zinc-400" />
                  ) : (
                    <ChevronRight className="size-4 text-zinc-400" />
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {order.order_number ?? order.id.slice(0, 8).toUpperCase()}
                </TableCell>
                <TableCell>{formatDate(order.created_at)}</TableCell>
                <TableCell>{formatPrice(order.total_cents)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(order.status)} className="capitalize">
                    {order.status}
                  </Badge>
                </TableCell>
              </TableRow>
              {expandedRows.has(order.id) && (
                <TableRow key={`${order.id}-items`}>
                  <TableCell colSpan={5} className="bg-muted/30 p-0">
                    <div className="px-8 py-3">
                      {order.order_items.length === 0 ? (
                        <p className="text-xs text-zinc-500">No items</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-zinc-500">
                              <th className="text-left pb-1">Item</th>
                              <th className="text-right pb-1">Qty</th>
                              <th className="text-right pb-1">Price</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.order_items.map((item) => (
                              <tr key={item.id}>
                                <td className="py-0.5">{item.product_title ?? 'Unknown product'}</td>
                                <td className="text-right py-0.5">{item.quantity}</td>
                                <td className="text-right py-0.5">{formatPrice(item.unit_price_cents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          ))}
        </TableBody>
      </Table>

      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-2 size-4 animate-spin" />}
            Load More
          </Button>
        </div>
      )}

      <p className="text-center text-xs text-zinc-500">
        Showing {orders.length} of {total} orders
      </p>
    </div>
  )
}
