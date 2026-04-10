import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { getStripeInstance } from '@/lib/stripe'

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

  const { data: profile } = await adminClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single()

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer found' }, { status: 400 })
  }

  try {
    const stripe = getStripeInstance()
    const origin = resolveOrigin(request)

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/profile/subscription`,
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('[subscription/portal] Stripe error', err)
    return NextResponse.json({ error: 'Could not create portal session' }, { status: 500 })
  }
}
