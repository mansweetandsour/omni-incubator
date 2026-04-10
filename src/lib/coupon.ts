// server-only — shared coupon validation logic
import { adminClient } from './supabase/admin'

export type CouponValidationResult =
  | {
      valid: true
      coupon: {
        id: string
        entry_type: string | null
        entry_value: number | null
        code: string
      }
    }
  | {
      valid: false
      message: string
    }

export async function validateCouponCode(
  code: string,
  userId: string
): Promise<CouponValidationResult> {
  const normalizedCode = code.toUpperCase().trim()

  const { data: coupon } = await adminClient
    .from('coupons')
    .select('id, code, entry_type, entry_value, is_active, expires_at, max_uses_global, current_uses, max_uses_per_user')
    .eq('code', normalizedCode)
    .maybeSingle()

  if (!coupon) {
    return { valid: false, message: 'Invalid coupon code' }
  }

  if (!coupon.is_active) {
    return { valid: false, message: 'Coupon is inactive' }
  }

  if (coupon.expires_at && new Date(coupon.expires_at) <= new Date()) {
    return { valid: false, message: 'Coupon has expired' }
  }

  if (coupon.max_uses_global !== null && coupon.current_uses >= coupon.max_uses_global) {
    return { valid: false, message: 'Coupon has reached its usage limit' }
  }

  const { count } = await adminClient
    .from('coupon_uses')
    .select('id', { count: 'exact', head: true })
    .eq('coupon_id', coupon.id)
    .eq('user_id', userId)

  if (coupon.max_uses_per_user !== null && (count ?? 0) >= coupon.max_uses_per_user) {
    return { valid: false, message: 'You have already used this coupon' }
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      entry_type: coupon.entry_type,
      entry_value: coupon.entry_value,
      code: coupon.code,
    },
  }
}
