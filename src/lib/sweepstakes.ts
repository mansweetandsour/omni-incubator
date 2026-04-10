// server-only — do not import in client components
import { adminClient } from '@/lib/supabase/admin'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CalculateEntriesParams {
  product: {
    price_cents: number
    member_price_cents: number | null
    custom_entry_amount: number | null
  }
  listPriceCents: number
  pricePaidCents: number
  sweepstakeId: string
  couponId?: string | null
  activeMultiplierMax?: number | null   // pre-fetched by caller
  coupon?: {
    entry_type: 'multiplier' | 'fixed_bonus'
    entry_value: number
  } | null                              // pre-fetched by caller
}

export interface CalculateEntriesResult {
  baseEntries: number
  multiplier: number
  couponMultiplier: number
  bonusEntries: number
  totalEntries: number
  listPriceCents: number
  amountCents: number
}

export interface AwardPurchaseEntriesParams {
  orderId: string
  orderItemId: string | null
  productId: string
  userId: string
  sweepstakeId: string
  listPriceCents: number
  pricePaidCents: number
  couponId?: string | null
}

export interface AwardLeadCaptureEntriesParams {
  leadCaptureId: string
  userId?: string | null
  sweepstakeId: string
  sampleProductId?: string | null
}

// ─── Debounce state ───────────────────────────────────────────────────────────

let _lastRefreshAt: number | null = null
const DEBOUNCE_MS = 60_000

// ─── Pure functions ───────────────────────────────────────────────────────────

/**
 * calculateEntries — pure, no DB calls.
 * Pre-fetched activeMultiplierMax and coupon are passed in by the caller.
 */
export function calculateEntries(params: CalculateEntriesParams): CalculateEntriesResult {
  const { product, listPriceCents, pricePaidCents, activeMultiplierMax, coupon } = params

  const baseEntries = product.custom_entry_amount ?? Math.floor(listPriceCents / 100)
  const globalMultiplier = activeMultiplierMax ?? 1.0
  const couponMultiplier = coupon?.entry_type === 'multiplier' ? coupon.entry_value : 1.0
  const bonusEntries = coupon?.entry_type === 'fixed_bonus' ? coupon.entry_value : 0
  const totalEntries = Math.floor(baseEntries * globalMultiplier * couponMultiplier) + bonusEntries

  return {
    baseEntries,
    multiplier: globalMultiplier,
    couponMultiplier,
    bonusEntries,
    totalEntries,
    listPriceCents,
    amountCents: pricePaidCents,
  }
}

/**
 * computeLeadCaptureEntries — pure helper, exported for tests.
 * No multipliers or coupons for non-purchase entries.
 */
export function computeLeadCaptureEntries(
  nonPurchaseEntryAmount: number,
  sampleCustomAmount?: number | null
): number {
  return sampleCustomAmount ?? nonPurchaseEntryAmount
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/**
 * fetchActiveMultiplierMax — query MAX active multiplier for a sweepstake.
 */
export async function fetchActiveMultiplierMax(sweepstakeId: string): Promise<number | null> {
  const { data } = await adminClient
    .from('entry_multipliers')
    .select('multiplier')
    .eq('sweepstake_id', sweepstakeId)
    .eq('is_active', true)
    .lte('start_at', new Date().toISOString())
    .gte('end_at', new Date().toISOString())
    .order('multiplier', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) return null
  return Number(data.multiplier)
}

/**
 * fetchCoupon — query coupon by ID (must be active).
 */
export async function fetchCoupon(couponId: string): Promise<{
  entry_type: 'multiplier' | 'fixed_bonus'
  entry_value: number
} | null> {
  const { data } = await adminClient
    .from('coupons')
    .select('entry_type, entry_value')
    .eq('id', couponId)
    .eq('is_active', true)
    .maybeSingle()

  if (!data) return null
  return {
    entry_type: data.entry_type as 'multiplier' | 'fixed_bonus',
    entry_value: Number(data.entry_value),
  }
}

// ─── Async DB writers ─────────────────────────────────────────────────────────

/**
 * awardPurchaseEntries — fetch product, multiplier, coupon; calculate; insert entry row.
 * Errors propagate to the caller (webhook try/catch).
 */
export async function awardPurchaseEntries(
  params: AwardPurchaseEntriesParams
): Promise<{ totalEntries: number }> {
  const {
    orderId,
    orderItemId,
    productId,
    userId,
    sweepstakeId,
    listPriceCents,
    pricePaidCents,
    couponId,
  } = params

  // 1. Fetch product
  const { data: productRow, error: productError } = await adminClient
    .from('products')
    .select('price_cents, member_price_cents, custom_entry_amount')
    .eq('id', productId)
    .single()

  if (productError || !productRow) {
    throw new Error(productError?.message ?? `Product not found: ${productId}`)
  }

  const product = {
    price_cents: productRow.price_cents,
    member_price_cents: productRow.member_price_cents ?? null,
    custom_entry_amount: productRow.custom_entry_amount ?? null,
  }

  // 2. Fetch active multiplier MAX
  const activeMultiplierMax = await fetchActiveMultiplierMax(sweepstakeId)

  // 3. Fetch coupon if provided
  const coupon = couponId ? await fetchCoupon(couponId) : null

  // 4. Calculate entries
  const result = calculateEntries({
    product,
    listPriceCents,
    pricePaidCents,
    sweepstakeId,
    couponId,
    activeMultiplierMax,
    coupon,
  })

  // 5. Insert sweepstake_entries
  const { error: insertError } = await adminClient.from('sweepstake_entries').insert({
    sweepstake_id: sweepstakeId,
    user_id: userId,
    source: 'purchase',
    order_id: orderId,
    order_item_id: orderItemId,
    product_id: productId,
    base_entries: result.baseEntries,
    multiplier: result.multiplier,
    coupon_multiplier: result.couponMultiplier,
    coupon_id: couponId ?? null,
    bonus_entries: result.bonusEntries,
    total_entries: result.totalEntries,
    list_price_cents: listPriceCents,
    amount_cents: pricePaidCents,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }

  // 6. Refresh entry verification (fire-and-forget)
  refreshEntryVerification()

  return { totalEntries: result.totalEntries }
}

/**
 * awardLeadCaptureEntries — insert non-purchase entry for a lead capture.
 */
export async function awardLeadCaptureEntries(
  params: AwardLeadCaptureEntriesParams
): Promise<{ totalEntries: number }> {
  const { leadCaptureId, userId, sweepstakeId, sampleProductId } = params

  // 1. Fetch sweepstake
  const { data: sweepstake, error: swError } = await adminClient
    .from('sweepstakes')
    .select('non_purchase_entry_amount')
    .eq('id', sweepstakeId)
    .single()

  if (swError || !sweepstake) {
    throw new Error(swError?.message ?? `Sweepstake not found: ${sweepstakeId}`)
  }

  // 2. Optionally fetch sample product custom_entry_amount
  let sampleCustomAmount: number | null = null
  if (sampleProductId) {
    const { data: sampleProduct } = await adminClient
      .from('sample_products')
      .select('custom_entry_amount')
      .eq('id', sampleProductId)
      .maybeSingle()
    sampleCustomAmount = sampleProduct?.custom_entry_amount ?? null
  }

  // 3. Compute base entries
  const baseEntries = computeLeadCaptureEntries(
    sweepstake.non_purchase_entry_amount,
    sampleCustomAmount
  )

  // 4. Insert sweepstake_entries
  const { error: insertError } = await adminClient.from('sweepstake_entries').insert({
    sweepstake_id: sweepstakeId,
    user_id: userId ?? null,
    lead_capture_id: leadCaptureId,
    source: 'non_purchase_capture',
    base_entries: baseEntries,
    multiplier: 1.0,
    coupon_multiplier: 1.0,
    coupon_id: null,
    bonus_entries: 0,
    total_entries: baseEntries,
    list_price_cents: 0,
    amount_cents: 0,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }

  // 5. Refresh entry verification (fire-and-forget)
  refreshEntryVerification()

  return { totalEntries: baseEntries }
}

// ─── Debounced refresh ────────────────────────────────────────────────────────

/**
 * refreshEntryVerification — module-level debounced (60s).
 * Calls the DB function to REFRESH MATERIALIZED VIEW CONCURRENTLY.
 * Non-blocking — never rethrows.
 */
export async function refreshEntryVerification(): Promise<void> {
  const now = Date.now()
  if (_lastRefreshAt !== null && now - _lastRefreshAt < DEBOUNCE_MS) {
    return // debounced — skip
  }
  _lastRefreshAt = now
  try {
    await adminClient.rpc('refresh_entry_verification')
  } catch (err) {
    console.error('[sweepstakes] refreshEntryVerification failed', err)
    // Non-blocking — do not rethrow
  }
}

// ─── Helper queries ───────────────────────────────────────────────────────────

/**
 * getActiveSweepstake — returns the currently active sweepstake or null.
 */
export async function getActiveSweepstake(): Promise<{
  id: string
  non_purchase_entry_amount: number
  prize_amount_cents: number | null
  title: string
  prize_description: string | null
} | null> {
  const { data } = await adminClient
    .from('sweepstakes')
    .select('id, non_purchase_entry_amount, prize_amount_cents, title, prize_description')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  return data ?? null
}
