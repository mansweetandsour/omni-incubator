import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'My Orders',
  robots: { index: false },
}
import { adminClient } from '@/lib/supabase/admin'
import { OrderHistory } from '@/components/billing/order-history'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware protects this route — user is always present here
  if (!user) return null

  const { data, count } = await adminClient
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(0, 19)

  const orders = data ?? []
  const total = count ?? 0

  return (
    <div className="container mx-auto max-w-4xl py-12 px-4">
      <h1 className="mb-8 text-3xl font-bold">Order History</h1>
      <OrderHistory initialOrders={orders} total={total} />
    </div>
  )
}
