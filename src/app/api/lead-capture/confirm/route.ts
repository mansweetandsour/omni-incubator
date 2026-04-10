import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { awardLeadCaptureEntries } from '@/lib/sweepstakes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { token } = body
  if (!token) {
    return NextResponse.json({ error: 'Token is required' }, { status: 400 })
  }

  // Query lead_capture by token
  const { data: lead, error: leadError } = await adminClient
    .from('lead_captures')
    .select('id, email, confirmed_at, confirmation_sent_at, sweepstake_id, sample_product_id, user_id, source, entry_awarded')
    .eq('confirmation_token', token)
    .maybeSingle()

  if (leadError || !lead) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 404 })
  }

  // Already confirmed — idempotent
  if (lead.confirmed_at) {
    const { data: entries } = await adminClient
      .from('sweepstake_entries')
      .select('total_entries')
      .eq('lead_capture_id', lead.id)

    const totalEntries = (entries ?? []).reduce(
      (sum: number, e: { total_entries: number }) => sum + (e.total_entries ?? 0),
      0
    )
    return NextResponse.json({
      alreadyConfirmed: true,
      entries: totalEntries,
      source: lead.source,
    })
  }

  // Expiry check — 72 hours
  const sentAt = new Date(lead.confirmation_sent_at).getTime()
  if (sentAt < Date.now() - 72 * 3600 * 1000) {
    return NextResponse.json({ error: 'Token expired', email: lead.email }, { status: 410 })
  }

  // If no sweepstake_id, just confirm without awarding
  if (!lead.sweepstake_id) {
    await adminClient
      .from('lead_captures')
      .update({ confirmed_at: new Date().toISOString(), entry_awarded: false })
      .eq('id', lead.id)
    return NextResponse.json({ success: true, entries: 0, source: lead.source, sweepstake: null, activeMultiplier: null })
  }

  // Update confirmed_at + entry_awarded
  await adminClient
    .from('lead_captures')
    .update({ confirmed_at: new Date().toISOString(), entry_awarded: true })
    .eq('id', lead.id)

  // Award lead capture entries
  let totalEntries = 0
  try {
    const { totalEntries: awarded } = await awardLeadCaptureEntries({
      leadCaptureId: lead.id,
      userId: lead.user_id ?? null,
      sweepstakeId: lead.sweepstake_id,
      sampleProductId: lead.sample_product_id ?? null,
    })
    totalEntries = awarded
  } catch (err) {
    console.error('[lead-capture/confirm] awardLeadCaptureEntries failed', err)
  }

  // Query active multiplier
  const { data: activeMultiplierRow } = await adminClient
    .from('entry_multipliers')
    .select('multiplier')
    .eq('sweepstake_id', lead.sweepstake_id)
    .eq('is_active', true)
    .lte('start_at', new Date().toISOString())
    .gte('end_at', new Date().toISOString())
    .order('multiplier', { ascending: false })
    .limit(1)
    .maybeSingle()

  const activeMultiplier = activeMultiplierRow ? Number(activeMultiplierRow.multiplier) : null

  // Sample product redirect
  if (lead.source === 'sample_product' && lead.sample_product_id) {
    const { data: sampleProduct } = await adminClient
      .from('sample_products')
      .select('slug')
      .eq('id', lead.sample_product_id)
      .maybeSingle()

    if (sampleProduct?.slug) {
      return NextResponse.json({
        redirect: `/free/${sampleProduct.slug}/download?token=${token}`,
      })
    }
  }

  // Standard success — fetch sweepstake info
  const { data: sweepstake } = await adminClient
    .from('sweepstakes')
    .select('title, prize_description')
    .eq('id', lead.sweepstake_id)
    .maybeSingle()

  return NextResponse.json({
    success: true,
    entries: totalEntries,
    source: lead.source,
    sweepstake: sweepstake
      ? { title: sweepstake.title, prize_description: sweepstake.prize_description }
      : null,
    activeMultiplier,
  })
}
