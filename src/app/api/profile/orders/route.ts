import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const pageNum = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const offset = (pageNum - 1) * 20

  const { data, count, error } = await adminClient
    .from('orders')
    .select('*, order_items(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + 19)

  if (error) {
    console.error('[profile/orders] query error', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }

  const total = count ?? 0
  const hasMore = offset + 20 < total

  return NextResponse.json({ orders: data ?? [], hasMore, total })
}
