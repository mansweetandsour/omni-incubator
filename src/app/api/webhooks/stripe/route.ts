import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { adminClient } from '@/lib/supabase/admin'
import { getStripeInstance } from '@/lib/stripe'
import { sendEmail } from '@/lib/email'
import { subscribeToBeehiiv, unsubscribeFromBeehiiv } from '@/lib/beehiiv'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function toISO(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString()
}

function resolveOrigin(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://omniincubator.org'
}

// Helper: get current_period_start/end from first subscription item
function getSubPeriod(sub: Stripe.Subscription) {
  const firstItem = sub.items.data[0]
  return {
    current_period_start: firstItem?.current_period_start ?? sub.billing_cycle_anchor,
    current_period_end: firstItem?.current_period_end ?? sub.billing_cycle_anchor,
  }
}

// Helper: resolve Supabase product_id from Stripe price ID
async function resolveProductIdFromPriceId(priceId: string): Promise<string | null> {
  const isMonthly = priceId === process.env.STRIPE_MONTHLY_PRICE_ID
  const isAnnual = priceId === process.env.STRIPE_ANNUAL_PRICE_ID

  if (isMonthly || isAnnual) {
    const { data: memProduct } = await adminClient
      .from('products')
      .select('id')
      .eq('type', isMonthly ? 'membership_monthly' : 'membership_annual')
      .single()
    if (memProduct?.id) return memProduct.id
  }

  // Fallback: query by stripe_price_id or stripe_member_price_id
  const { data: product } = await adminClient
    .from('products')
    .select('id')
    .or(`stripe_price_id.eq.${priceId},stripe_member_price_id.eq.${priceId}`)
    .maybeSingle()

  return product?.id ?? null
}

// Helper: get Stripe subscription ID from Invoice (v22 API)
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent
  if (parent?.type === 'subscription_details' && parent.subscription_details?.subscription) {
    const sub = parent.subscription_details.subscription
    return typeof sub === 'string' ? sub : sub.id
  }
  return null
}

// Helper: check if all invoice line items are proration items (v22: check parent.type)
function isAllProration(invoice: Stripe.Invoice): boolean {
  return invoice.lines?.data?.every(
    (line) => line.parent?.type === 'invoice_item_details'
  ) ?? false
}

export async function POST(request: NextRequest) {
  const stripe = getStripeInstance()

  const rawBody = await request.text()
  const buf = Buffer.from(rawBody)
  const sig = request.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Idempotency check
  const { data: claimed } = await adminClient.rpc('claim_stripe_event', {
    p_event_id: event.id,
    p_event_type: event.type,
  })

  if (!claimed || (Array.isArray(claimed) && claimed.length === 0)) {
    return NextResponse.json({ received: true }, { status: 200 })
  }

  const origin = resolveOrigin()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session

      // Resolve userId from metadata or profile lookup
      let userId = session.metadata?.user_id
      let userEmail = ''

      if (!userId) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('id, email')
          .eq('stripe_customer_id', session.customer as string)
          .single()
        userId = profile?.id
        userEmail = profile?.email ?? ''
      }

      if (!userId) {
        console.error('[webhook] checkout.session.completed: could not resolve user_id', event.id)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      if (!userEmail) {
        const { data: profile } = await adminClient
          .from('profiles')
          .select('email')
          .eq('id', userId)
          .single()
        userEmail = profile?.email ?? ''
      }

      if (session.mode === 'payment') {
        const discountCents =
          session.total_details?.breakdown?.discounts?.reduce((sum, d) => sum + d.amount, 0) ?? 0

        const ebookId = session.metadata?.ebook_id
        if (!ebookId) {
          console.error('[webhook] payment session missing ebook_id', event.id)
          await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
          return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }

        const { data: ebook } = await adminClient
          .from('ebooks')
          .select('id, product_id, products!inner(id, title, price_cents)')
          .eq('id', ebookId)
          .single()

        if (!ebook) {
          console.error('[webhook] ebook not found for checkout', ebookId, event.id)
          await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
          return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }

        const product = (ebook.products as unknown) as { id: string; title: string; price_cents: number }

        try {
          const { data: newOrder, error: orderError } = await adminClient
            .from('orders')
            .insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              status: 'completed',
              subtotal_cents: session.amount_subtotal,
              discount_cents: discountCents,
              total_cents: session.amount_total,
              is_member_discount: session.metadata?.is_member_price === 'true',
              coupon_id: session.metadata?.coupon_id ?? null,
              coupon_code: session.metadata?.coupon_code ?? null,
              entries_awarded_by_checkout: false,
            })
            .select('id')
            .single()

          if (orderError || !newOrder) {
            throw new Error(orderError?.message ?? 'Failed to insert order')
          }

          const newOrderId = newOrder.id

          await adminClient.from('order_items').insert({
            order_id: newOrderId,
            product_id: ebook.product_id,
            product_type: 'ebook',
            product_title: product.title,
            quantity: 1,
            unit_price_cents: session.amount_total,
            list_price_cents: product.price_cents,
          })

          await adminClient.from('user_ebooks').insert({
            user_id: userId,
            ebook_id: ebookId,
            order_id: newOrderId,
          })

          // TODO Phase 4A: award sweepstake entries (ebook purchase)
        } catch (err) {
          console.error('[webhook] error processing checkout.session.completed payment', event.id, err)
          await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
          return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }

        // Fire-and-forget external calls
        sendEmail('ebook_purchase', userEmail, {
          ebookTitle: product.title,
          downloadUrl: `${origin}/api/ebooks/${ebookId}/download`,
          orderNumber: session.id,
          totalCents: session.amount_total ?? 0,
        }, userId).catch(console.error)

      } else if (session.mode === 'subscription') {
        // Combined checkout
        const ebookId = session.metadata?.ebook_id
        const discountCents =
          session.total_details?.breakdown?.discounts?.reduce((sum, d) => sum + d.amount, 0) ?? 0

        try {
          const { data: newOrder, error: orderError } = await adminClient
            .from('orders')
            .insert({
              user_id: userId,
              stripe_checkout_session_id: session.id,
              status: 'completed',
              subtotal_cents: session.amount_subtotal,
              discount_cents: discountCents,
              total_cents: session.amount_total,
              is_member_discount: true,
              entries_awarded_by_checkout: true,
            })
            .select('id')
            .single()

          if (orderError || !newOrder) {
            throw new Error(orderError?.message ?? 'Failed to insert order')
          }

          const newOrderId = newOrder.id

          if (ebookId) {
            const { data: ebook } = await adminClient
              .from('ebooks')
              .select('id, product_id, products!inner(id, title, price_cents)')
              .eq('id', ebookId)
              .single()

            if (ebook) {
              const product = (ebook.products as unknown) as { id: string; title: string; price_cents: number }

              await adminClient.from('order_items').insert({
                order_id: newOrderId,
                product_id: ebook.product_id,
                product_type: 'ebook',
                product_title: product.title,
                quantity: 1,
                unit_price_cents: session.amount_total,
                list_price_cents: product.price_cents,
              })

              await adminClient.from('user_ebooks').insert({
                user_id: userId,
                ebook_id: ebookId,
                order_id: newOrderId,
              })
            }
          }

          // Retrieve full subscription and upsert
          if (session.subscription) {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string)
            const productId = await resolveProductIdFromPriceId(sub.items.data[0].price.id)

            if (!productId) {
              throw new Error(`Could not resolve productId for price ${sub.items.data[0].price.id}`)
            }

            const { current_period_start, current_period_end } = getSubPeriod(sub)

            await adminClient.from('subscriptions').upsert(
              {
                user_id: userId,
                stripe_subscription_id: sub.id,
                stripe_customer_id: sub.customer as string,
                product_id: productId,
                status: sub.status,
                trial_start: sub.trial_start ? toISO(sub.trial_start) : null,
                trial_end: sub.trial_end ? toISO(sub.trial_end) : null,
                current_period_start: toISO(current_period_start),
                current_period_end: toISO(current_period_end),
                cancel_at_period_end: sub.cancel_at_period_end,
              },
              { onConflict: 'stripe_subscription_id' }
            )
          }

          // TODO Phase 4A: award sweepstake entries (combined checkout — entries_awarded_by_checkout=true)
        } catch (err) {
          console.error('[webhook] error processing checkout.session.completed subscription', event.id, err)
          await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
          return NextResponse.json({ error: 'Internal error' }, { status: 500 })
        }
      }

      break
    }

    case 'customer.subscription.created': {
      const sub = event.data.object as Stripe.Subscription

      if (!['trialing', 'active'].includes(sub.status)) {
        return NextResponse.json({ received: true }, { status: 200 })
      }

      const { data: profile } = await adminClient
        .from('profiles')
        .select('id, email')
        .eq('stripe_customer_id', sub.customer as string)
        .single()

      if (!profile) {
        console.error('[webhook] subscription.created: profile not found for customer', sub.customer, event.id)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      const productId = await resolveProductIdFromPriceId(sub.items.data[0].price.id)

      if (!productId) {
        console.error('[webhook] subscription.created: could not resolve productId for price', sub.items.data[0].price.id, event.id)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      const { current_period_start, current_period_end } = getSubPeriod(sub)

      try {
        await adminClient.from('subscriptions').upsert(
          {
            user_id: profile.id,
            stripe_subscription_id: sub.id,
            stripe_customer_id: sub.customer as string,
            product_id: productId,
            status: sub.status,
            trial_start: sub.trial_start ? toISO(sub.trial_start) : null,
            trial_end: sub.trial_end ? toISO(sub.trial_end) : null,
            current_period_start: toISO(current_period_start),
            current_period_end: toISO(current_period_end),
            cancel_at_period_end: sub.cancel_at_period_end,
          },
          { onConflict: 'stripe_subscription_id' }
        )
      } catch (err) {
        console.error('[webhook] error processing subscription.created', event.id, err)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      // Fire-and-forget external calls
      const displayName = profile.email?.split('@')[0] ?? 'Member'
      const trialEndDate = sub.trial_end ? toISO(sub.trial_end) : toISO(current_period_end)
      sendEmail('membership_welcome', profile.email, {
        displayName,
        trialEndDate,
        libraryUrl: `${origin}/library`,
      }, profile.id).catch(console.error)
      subscribeToBeehiiv(profile.email).catch(console.error)

      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription

      const productId = await resolveProductIdFromPriceId(sub.items.data[0].price.id)
      const { current_period_start, current_period_end } = getSubPeriod(sub)

      try {
        await adminClient
          .from('subscriptions')
          .update({
            status: sub.status,
            current_period_start: toISO(current_period_start),
            current_period_end: toISO(current_period_end),
            cancel_at_period_end: sub.cancel_at_period_end,
            ...(productId ? { product_id: productId } : {}),
          })
          .eq('stripe_subscription_id', sub.id)
      } catch (err) {
        console.error('[webhook] error processing subscription.updated', event.id, err)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription

      // Resolve user email for unsubscribe
      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('stripe_customer_id', sub.customer as string)
        .single()

      try {
        await adminClient
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: sub.canceled_at ? toISO(sub.canceled_at) : new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
      } catch (err) {
        console.error('[webhook] error processing subscription.deleted', event.id, err)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      if (profile?.email) {
        unsubscribeFromBeehiiv(profile.email).catch(console.error)
      }

      break
    }

    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription

      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('stripe_customer_id', sub.customer as string)
        .single()

      if (profile?.email) {
        sendEmail('trial_ending', profile.email, {
          trialEndDate: toISO(sub.trial_end!),
          portalUrl: `${origin}/profile/subscription`,
        }).catch(console.error)
      }

      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice

      if (invoice.amount_paid === 0) {
        return NextResponse.json({ received: true }, { status: 200 })
      }

      // Skip proration-only invoices (v22: check parent.type === 'invoice_item_details')
      if (invoice.billing_reason === 'subscription_update' && isAllProration(invoice)) {
        return NextResponse.json({ received: true }, { status: 200 })
      }

      const subscriptionId = getInvoiceSubscriptionId(invoice)

      if (!subscriptionId) {
        console.warn('[webhook] invoice.paid: no subscription ID on invoice', event.id)
        break
      }

      const { data: sub } = await adminClient
        .from('subscriptions')
        .select('user_id, id')
        .eq('stripe_subscription_id', subscriptionId)
        .single()

      if (!sub) {
        // Subscription may not exist yet if this fires before subscription.created
        console.warn('[webhook] invoice.paid: subscription not found for', subscriptionId, event.id)
        break
      }

      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('id', sub.user_id)
        .single()

      try {
        await adminClient
          .from('subscriptions')
          .update({ status: 'active' })
          .eq('stripe_subscription_id', subscriptionId)

        await adminClient.from('orders').insert({
          user_id: sub.user_id,
          stripe_invoice_id: invoice.id,
          status: 'completed',
          subtotal_cents: invoice.subtotal,
          discount_cents: 0,
          total_cents: invoice.amount_paid,
          is_subscription_renewal: true,
          entries_awarded_by_checkout: false,
        })

        // TODO Phase 4A: award sweepstake entries (renewal — dedup: query subscriptions.user_id via invoice.subscription, then orders where entries_awarded_by_checkout=true AND is_subscription_renewal=false LIMIT 1)
      } catch (err) {
        console.error('[webhook] error processing invoice.paid', event.id, err)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      if (profile?.email) {
        sendEmail('membership_charged', profile.email, {
          amountCents: invoice.amount_paid,
          nextBillingDate: toISO(invoice.period_end),
        }, sub.user_id).catch(console.error)
      }

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice

      const subscriptionId = getInvoiceSubscriptionId(invoice)

      const { data: profile } = await adminClient
        .from('profiles')
        .select('email')
        .eq('stripe_customer_id', invoice.customer as string)
        .single()

      try {
        if (subscriptionId) {
          await adminClient
            .from('subscriptions')
            .update({ status: 'past_due' })
            .eq('stripe_subscription_id', subscriptionId)
        }
      } catch (err) {
        console.error('[webhook] error processing invoice.payment_failed', event.id, err)
        await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
      }

      if (profile?.email) {
        sendEmail('payment_failed', profile.email, {
          portalUrl: `${origin}/profile/subscription`,
        }).catch(console.error)
      }

      break
    }

    default:
      // Unhandled event type — return 200 to avoid Stripe retries
      break
  }

  return NextResponse.json({ received: true }, { status: 200 })
}
