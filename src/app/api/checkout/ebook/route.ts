import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getOrCreateStripeCustomer, getStripeInstance } from '@/lib/stripe'
import { isActiveMember } from '@/lib/membership'
import { validateCouponCode } from '@/lib/coupon'

function resolveOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') ?? request.headers.get('host') ?? 'https://omniincubator.org'
  if (origin.startsWith('http://') || origin.startsWith('https://')) {
    return origin
  }
  return `https://${origin}`
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { ebookId?: string; couponCode?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { ebookId, couponCode } = body
  if (!ebookId) {
    return NextResponse.json({ error: 'Missing ebookId' }, { status: 400 })
  }

  // Fetch ebook with product
  const { data: ebook } = await adminClient
    .from('ebooks')
    .select('id, product_id, products!inner(id, slug, stripe_price_id, stripe_member_price_id, price_cents, title)')
    .eq('id', ebookId)
    .single()

  if (!ebook) {
    return NextResponse.json({ error: 'E-book not found' }, { status: 404 })
  }

  const product = (ebook.products as unknown) as {
    id: string
    slug: string
    stripe_price_id: string | null
    stripe_member_price_id: string | null
    price_cents: number
    title: string
  }

  const isMember = await isActiveMember(user.id)
  const priceId = isMember ? product.stripe_member_price_id : product.stripe_price_id

  if (!priceId) {
    return NextResponse.json({ error: 'Product not available for purchase' }, { status: 400 })
  }

  // Coupon validation
  let couponId: string | undefined
  if (couponCode && couponCode.trim() !== '') {
    const validationResult = await validateCouponCode(couponCode, user.id)
    if (!validationResult.valid) {
      return NextResponse.json({ error: validationResult.message }, { status: 400 })
    }
    couponId = validationResult.coupon.id
  }

  try {
    const stripe = getStripeInstance()
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email ?? '')

    const rewardfulReferral = request.cookies.get('rewardful_referral')?.value
    const clientReferenceId = rewardfulReferral && rewardfulReferral !== '' ? rewardfulReferral : undefined

    const origin = resolveOrigin(request)

    const metadata: Record<string, string> = {
      ebook_id: ebookId,
      user_id: user.id,
      is_member_price: String(isMember),
      ...(couponId && couponCode ? { coupon_id: couponId, coupon_code: couponCode.toUpperCase() } : {}),
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      customer: stripeCustomerId,
      success_url: `${origin}/ebooks/download/${ebookId}?checkout=success`,
      cancel_url: `${origin}/library/${product.slug}?checkout=canceled`,
      metadata,
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout/ebook] Stripe error', err)
    return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 })
  }
}
