import { NextRequest, NextResponse } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { adminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function makeRateLimiter(
  requests: number,
  window: `${number} ${'ms' | 's' | 'm' | 'h' | 'd'}`
) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.warn('[rate-limit] Upstash not configured — skipping rate limit')
    return null
  }
  return new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }),
    limiter: Ratelimit.slidingWindow(requests, window),
  })
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 per IP per hour
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'

  const rateLimiter = makeRateLimiter(5, '1 h')
  if (rateLimiter) {
    const { success } = await rateLimiter.limit(`lead_capture:${clientIp}`)
    if (!success) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }
  }

  // Parse and validate body
  let body: {
    email?: string
    phone?: string
    source?: string
    sweepstakeId?: string
    sampleProductId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email, phone, source = 'popup', sweepstakeId: bodySwId, sampleProductId } = body

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }

  // Resolve sweepstake
  let resolvedSweepstakeId: string | null = bodySwId ?? null
  let sweepstakeTitle = ''
  let sweepstakePrizeDescription: string | null = null

  if (!resolvedSweepstakeId) {
    const { data: activeSw } = await adminClient
      .from('sweepstakes')
      .select('id, title, prize_description')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (activeSw) {
      resolvedSweepstakeId = activeSw.id
      sweepstakeTitle = activeSw.title
      sweepstakePrizeDescription = activeSw.prize_description ?? null
    }
  } else {
    const { data: sw } = await adminClient
      .from('sweepstakes')
      .select('id, title, prize_description')
      .eq('id', resolvedSweepstakeId)
      .maybeSingle()
    if (sw) {
      sweepstakeTitle = sw.title
      sweepstakePrizeDescription = sw.prize_description ?? null
    }
  }

  // No active sweepstake — insert lead without sweepstake_id
  if (!resolvedSweepstakeId) {
    await adminClient.from('lead_captures').insert({
      email,
      phone: phone ?? null,
      source,
      sweepstake_id: null,
      sample_product_id: sampleProductId ?? null,
      ip_address: clientIp,
      confirmation_token: crypto.randomUUID(),
      confirmation_sent_at: new Date().toISOString(),
      confirmed_at: null,
      entry_awarded: false,
    })
    return NextResponse.json({ success: true, noActiveSweepstake: true })
  }

  // Duplicate check
  const { data: existing } = await adminClient
    .from('lead_captures')
    .select('id')
    .eq('email', email)
    .eq('sweepstake_id', resolvedSweepstakeId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ duplicate: true, message: "You've already entered" })
  }

  // Insert lead_capture
  const { data: insertedRow, error: insertError } = await adminClient
    .from('lead_captures')
    .insert({
      email,
      phone: phone ?? null,
      source,
      sweepstake_id: resolvedSweepstakeId,
      sample_product_id: sampleProductId ?? null,
      ip_address: clientIp,
      confirmation_token: crypto.randomUUID(),
      confirmation_sent_at: new Date().toISOString(),
      confirmed_at: null,
      entry_awarded: false,
    })
    .select()
    .single()

  if (insertError || !insertedRow) {
    console.error('[lead-capture] insert error', insertError)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  // Send confirmation email (fire-and-forget)
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://omniincubator.org'
  const confirmUrl = `${siteUrl}/confirm/${insertedRow.confirmation_token}`

  try {
    if (source === 'sample_product' && sampleProductId) {
      // Fetch product title for sample product email
      const { data: sampleProduct } = await adminClient
        .from('sample_products')
        .select('title')
        .eq('id', sampleProductId)
        .maybeSingle()

      await sendEmail('sample_product_confirm', email, {
        confirmUrl,
        productTitle: sampleProduct?.title ?? 'your free product',
      })
    } else {
      await sendEmail('lead_capture_confirm', email, {
        confirmUrl,
        sweepstakeTitle,
        prizeDescription: sweepstakePrizeDescription,
      })
    }
  } catch (emailErr) {
    console.error('[lead-capture] email send failed', emailErr)
  }

  return NextResponse.json({ success: true })
}
