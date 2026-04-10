// server-only — do not import in client components
import Stripe from 'stripe'
import { adminClient } from './supabase/admin'

// Lazy singleton — avoids throwing at module evaluation time when key is absent
let _stripe: Stripe | null = null

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
    })
  }
  return _stripe
}

export async function syncStripeProduct(productId: string): Promise<void> {
  const stripe = getStripe()
  if (!stripe) return

  // 1. Read product: get title, price_cents, member_price_cents, stripe_product_id
  const { data: product, error } = await adminClient
    .from('products')
    .select('id, title, price_cents, member_price_cents, stripe_product_id')
    .eq('id', productId)
    .single()

  if (error || !product) return

  // 2. Idempotency guard: if stripe_product_id non-null/non-empty, return
  if (product.stripe_product_id && product.stripe_product_id !== '') return

  // 3. Create Stripe product
  const stripeProduct = await stripe.products.create({ name: product.title })
  const stripeProductId = stripeProduct.id

  // 4. Create full price
  const fullPrice = await stripe.prices.create({
    unit_amount: product.price_cents,
    currency: 'usd',
    product: stripeProductId,
  })

  // 5. Create member price
  const memberPrice = await stripe.prices.create({
    unit_amount: product.member_price_cents,
    currency: 'usd',
    product: stripeProductId,
  })

  // 6. Update DB with Stripe IDs
  await adminClient
    .from('products')
    .update({
      stripe_product_id: stripeProductId,
      stripe_price_id: fullPrice.id,
      stripe_member_price_id: memberPrice.id,
    })
    .eq('id', productId)
}

export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe not configured')

  const { data: profile } = await adminClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  })

  await adminClient
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  return customer.id
}

export function getStripeInstance(): Stripe {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured — STRIPE_SECRET_KEY missing')
  return s
}

export async function syncStripeNewPrices(
  productId: string,
  memberPriceCents: number
): Promise<void> {
  const stripe = getStripe()
  if (!stripe) return

  // 1. Read product: get stripe_product_id, price_cents
  const { data: product, error } = await adminClient
    .from('products')
    .select('id, price_cents, stripe_product_id')
    .eq('id', productId)
    .single()

  if (error || !product || !product.stripe_product_id) return

  // 2. Create new full price
  const newFullPrice = await stripe.prices.create({
    unit_amount: product.price_cents,
    currency: 'usd',
    product: product.stripe_product_id,
  })

  // 3. Create new member price (use memberPriceCents param — DB-sourced)
  const newMemberPrice = await stripe.prices.create({
    unit_amount: memberPriceCents,
    currency: 'usd',
    product: product.stripe_product_id,
  })

  // 4. Update DB with new Stripe price IDs
  // Note: old prices are NOT archived in Phase 2
  await adminClient
    .from('products')
    .update({
      stripe_price_id: newFullPrice.id,
      stripe_member_price_id: newMemberPrice.id,
    })
    .eq('id', productId)
}
