import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { code } = body
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'Missing coupon code' }, { status: 400 })
  }

  const normalizedCode = code.toUpperCase().trim()

  const { data: coupon } = await adminClient
    .from('coupons')
    .select('id, code, entry_type, entry_value, is_active, expires_at, max_uses_global, current_uses, max_uses_per_user')
    .eq('code', normalizedCode)
    .maybeSingle()

  if (!coupon) {
    return NextResponse.json({ valid: false, message: 'Invalid coupon code' })
  }

  if (!coupon.is_active) {
    return NextResponse.json({ valid: false, message: 'Coupon is inactive' })
  }

  if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
    return NextResponse.json({ valid: false, message: 'Coupon has expired' })
  }

  if (coupon.max_uses_global !== null && coupon.current_uses >= coupon.max_uses_global) {
    return NextResponse.json({ valid: false, message: 'Coupon has reached its usage limit' })
  }

  // Per-user check
  const { count } = await adminClient
    .from('coupon_uses')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id)
    .eq('user_id', user.id)

  if (coupon.max_uses_per_user !== null && (count ?? 0) >= coupon.max_uses_per_user) {
    return NextResponse.json({ valid: false, message: 'You have already used this coupon' })
  }

  return NextResponse.json({
    valid: true,
    coupon: {
      id: coupon.id,
      entry_type: coupon.entry_type,
      entry_value: coupon.entry_value,
      code: coupon.code,
    },
  })
}
