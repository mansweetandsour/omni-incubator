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

  let body: { plan?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { plan } = body
  if (plan !== 'monthly' && plan !== 'annual') {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  // Check for existing active subscription
  const { data: existingSub } = await adminClient
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active'])
    .maybeSingle()

  if (existingSub) {
    return NextResponse.json({ error: 'You already have an active membership' }, { status: 400 })
  }

  try {
    const stripe = getStripeInstance()
    const stripeCustomerId = await getOrCreateStripeCustomer(user.id, user.email ?? '')

    const rewardfulReferral = request.cookies.get('rewardful_referral')?.value
    const clientReferenceId = rewardfulReferral && rewardfulReferral !== '' ? rewardfulReferral : undefined

    const priceId = plan === 'monthly'
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_ANNUAL_PRICE_ID

    if (!priceId) {
      return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 })
    }

    const origin = resolveOrigin(request)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 7 },
      allow_promotion_codes: true,
      customer: stripeCustomerId,
      success_url: `${origin}/library?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=canceled`,
      ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}),
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[checkout/membership] Stripe error', err)
    return NextResponse.json({ error: 'Checkout session creation failed' }, { status: 500 })
  }
}
