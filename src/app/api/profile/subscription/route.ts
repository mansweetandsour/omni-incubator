import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await adminClient
    .from('subscriptions')
    .select('status, current_period_end, trial_end, cancel_at_period_end, products!inner(title)')
    .eq('user_id', user.id)
    .in('status', ['trialing', 'active', 'past_due', 'canceled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[profile/subscription] query error', error)
    return NextResponse.json({ error: 'Failed to fetch subscription' }, { status: 500 })
  }

  if (!data) {
    return NextResponse.json({ subscription: null })
  }

  const products = (data.products as unknown) as { title: string } | null

  return NextResponse.json({
    subscription: {
      status: data.status,
      plan: products?.title ?? null,
      trial_end: data.trial_end,
      current_period_end: data.current_period_end,
      cancel_at_period_end: data.cancel_at_period_end,
    },
  })
}
