import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getOrCreateStripeCustomer, getStripeInstance } from '@/lib/stripe'

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

  let body: { ebookId?: string; plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { ebookId, plan } = body

  if (!ebookId) {
    return NextResponse.json({ error: 'Missing ebookId' }, { status: 400 })
  }

  if (plan !== 'monthly' && plan !== 'annual') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // Pre-check for existing active subscription
  const { data: existingSub } = await adminClient
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active'])
    .maybeSingle()

  if (existingSub) {
    return NextResponse.json({ error: 'You already have an active membership' }, { status: 400 })
  }

  // Fetch ebook with product
  const { data: ebook } = await adminClient
    .from('ebooks')
    .select('id, products!inner(id, title, stripe_member_price_id)')
    .eq('id', ebookId)
    .single()

  if (!ebook) {
    return NextResponse.json({ error: 'E-book not found' }, { status: 404 })
  }

  const product = (ebook.products as unknown) as {
    id: string
    title: string
    stripe_member_price_id: string | null
  }

  if (!product.stripe_member_price_id) {
    return NextResponse.json({ error: 'Product not available for purchase' }, { status: 400 })
  }

  try {
    const stripe = getStripeInstance()
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email ?? '')

    const rewardfulReferral = request.cookies.get('rewardful_referral')?.value
    const clientReferenceId = rewardfulReferral && rewardfulReferral !== '' ? rewardfulReferral : undefined

    const membershipPriceId = plan === 'monthly'
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_ANNUAL_PRICE_ID

    if (!membershipPriceId) {
      return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 })
    }

    const origin = resolveOrigin(request)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        { price: membershipPriceId, quantity: 1 },
        { price: product.stripe_member_price_id, quantity: 1 },
      ],
      subscription_data: { trial_period_days: 7 },
      allow_promotion_codes: true,
      customer: stripeCustomerId,
      metadata: {
        ebook_id: ebookId,
        user_id: user.id,
        is_member_price: 'true',
      },
      success_url: `${origin}/library?checkout=success`,
      cancel_url: `${origin}/library?checkout=canceled`,
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout/ebook-with-membership] Stripe error', err)
    return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 })
  }
}
