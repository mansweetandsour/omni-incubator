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
  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email } = body
  if (!email) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  // Rate limit: 1 per email per 5 minutes
  const rateLimiter = makeRateLimiter(1, '5 m')
  if (rateLimiter) {
    const { success } = await rateLimiter.limit(`resend_confirm:${email}`)
    if (!success) {
      return NextResponse.json({ error: 'Too soon' }, { status: 429 })
    }
  }

  // Query unconfirmed lead capture
  const { data: lead } = await adminClient
    .from('lead_captures')
    .select('id, email, confirmation_sent_at, sweepstake_id, sample_product_id, source')
    .eq('email', email)
    .is('confirmed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Silent 200 for not-found email (no enumeration)
  if (!lead) {
    return NextResponse.json({ success: true })
  }

  const sentAt = new Date(lead.confirmation_sent_at).getTime()
  const now = Date.now()
  const fiveMinMs = 5 * 60 * 1000

  // DB-level "too soon" guard (for Upstash-absent environments)
  if (sentAt > now - fiveMinMs) {
    return NextResponse.json({ error: 'Too soon' }, { status: 429 })
  }

  // Expiry check — 72 hours
  if (sentAt < now - 72 * 3600 * 1000) {
    return NextResponse.json(
      { error: 'Expired', message: 'This link has expired. Please re-submit your email.' },
      { status: 410 }
    )
  }

  // Regenerate token and update sent_at
  const newToken = crypto.randomUUID()
  await adminClient
    .from('lead_captures')
    .update({
      confirmation_token: newToken,
      confirmation_sent_at: new Date().toISOString(),
    })
    .eq('id', lead.id)

  // Resend email
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://omniincubator.org'
  const confirmUrl = `${siteUrl}/confirm/${newToken}`

  try {
    if (lead.source === 'sample_product' && lead.sample_product_id) {
      const { data: sampleProduct } = await adminClient
        .from('sample_products')
        .select('title')
        .eq('id', lead.sample_product_id)
        .maybeSingle()

      await sendEmail('sample_product_confirm', email, {
        confirmUrl,
        productTitle: sampleProduct?.title ?? 'your free product',
      })
    } else {
      // Fetch sweepstake details if available
      let sweepstakeTitle = ''
      let prizeDescription: string | null = null
      if (lead.sweepstake_id) {
        const { data: sw } = await adminClient
          .from('sweepstakes')
          .select('title, prize_description')
          .eq('id', lead.sweepstake_id)
          .maybeSingle()
        sweepstakeTitle = sw?.title ?? ''
        prizeDescription = sw?.prize_description ?? null
      }
      await sendEmail('lead_capture_confirm', email, {
        confirmUrl,
        sweepstakeTitle,
        prizeDescription,
      })
    }
  } catch (emailErr) {
    console.error('[lead-capture/resend] email send failed', emailErr)
  }

  return NextResponse.json({ success: true })
}
