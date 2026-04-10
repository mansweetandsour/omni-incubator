# SPEC.md — Phase 3: Billing
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing

---

## 1. Overview

This specification covers the complete billing system: Stripe customer management, all three checkout flows (ebook, membership, combined), a Stripe webhook handler with transactional idempotency, coupon validation, profile pages (orders, ebooks, subscription), the ebook download flow, Beehiiv newsletter integration, React Email transactional emails, and the `/pricing` page. All decisions below are final and binding on downstream agents.

---

## 2. Tech Stack Additions

| Concern | Decision | Rationale |
|---|---|---|
| Stripe SDK | `stripe` v22 (already installed) | Server-only. Existing instance in `src/lib/stripe.ts`. |
| Transactional email | `resend` + `@react-email/components` (both already installed) | `react-email` v5 + `resend` v6 already in package.json. Templates render server-side with `render()` from `@react-email/components`. |
| DB transaction | Supabase `rpc()` wrapping idempotency INSERT — see §3.1 | Best robust option without adding new infrastructure. |
| Webhook body | `request.text()` then `Buffer.from(text)` for Stripe signature verification | See §3.2. |
| Email templates | React Email components in `src/emails/` | Rendered to HTML string server-side with `render()` before calling Resend. |
| Beehiiv | Fetch-based HTTP utility in `src/lib/beehiiv.ts` | No SDK available — direct API calls. |

---

## 3. Architectural Decisions

### 3.1 DB Transaction Mechanism (WARN-1 Resolution)

**Decision: Postgres RPC function for the idempotency INSERT + sequential atomic Supabase JS calls for side effects, with compensating delete on failure.**

Rationale:
- The Supabase JS client has no multi-statement transaction API.
- Installing `pg` (Node Postgres) directly would add new infrastructure and a connection pool — rejected per "most robust approach available without adding new infrastructure."
- A single stored function wrapping ALL side effects (orders, subscriptions, user_ebooks) would be extremely complex to maintain and bypass the Backend agent's ability to write readable application code.

**Selected approach:** Use `supabase.rpc('claim_stripe_event', { p_event_id, p_event_type })` for the idempotency INSERT. This stored function executes `INSERT INTO processed_stripe_events ... ON CONFLICT DO NOTHING RETURNING event_id` and returns the row. If the function returns null/no data, the event was already processed — return 200 immediately. If it returns a row, proceed with sequential Supabase JS calls.

**Compensating transaction pattern:**
```
1. rpc('claim_stripe_event') → if null/empty result, return 200 (already processed)
2. try {
     // all DB side effects (sequential Supabase JS inserts/upserts)
   } catch (err) {
     // compensating: adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
     // log error
     return 500 so Stripe retries
   }
3. // after try block succeeds: external HTTP calls (Beehiiv, Resend) — non-blocking, no await
4. return 200
```

**Migration required:** Add `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` with the `claim_stripe_event` stored function (see §4).

### 3.2 Webhook Body Parsing

Stripe requires raw bytes for HMAC signature verification. In Next.js App Router Route Handlers:

```typescript
const rawBody = await request.text()
const buf = Buffer.from(rawBody)
const sig = request.headers.get('stripe-signature') ?? ''
let event: Stripe.Event
try {
  event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET!)
} catch {
  return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
}
```

Do NOT call `request.json()` first — it consumes the readable stream. The route handler must export `export const runtime = 'nodejs'` (not 'edge') because `Buffer` is a Node.js global not available in the Edge runtime.

### 3.3 Combined Checkout Race Condition (WARN-2 Resolution)

Both `checkout.session.completed` (mode=subscription) and `customer.subscription.created` may arrive within milliseconds for the same subscription. Both handlers UPSERT the `subscriptions` row:

```typescript
await adminClient.from('subscriptions').upsert(
  { stripe_subscription_id: sub.id, ...fields },
  { onConflict: 'stripe_subscription_id' }
)
```

The `membership_welcome` email and Beehiiv subscribe are ONLY sent from the `customer.subscription.created` handler — never from `checkout.session.completed` — to prevent double-sending. The `checkout.session.completed` handler upserts the subscription row silently.

Ordering assumption: either event may arrive first. The upsert pattern handles both orderings without error.

### 3.4 `is_member_discount` Determination (WARN-6 Resolution)

At checkout session creation time in `/api/checkout/ebook`, store `is_member_price: 'true'` or `is_member_price: 'false'` in session `metadata`. The webhook reads `session.metadata.is_member_price === 'true'` to set `orders.is_member_discount`. This is more reliable than re-querying subscription status at webhook time (status could change between checkout creation and webhook delivery).

### 3.5 `discount_cents` Null-Safety (WARN-4 Resolution)

```typescript
const discountCents =
  session.total_details?.breakdown?.discounts?.reduce((sum, d) => sum + d.amount, 0) ?? 0
```

### 3.6 Email Template Rendering

React Email templates live in `src/emails/`. Each is a `.tsx` React component. Server-side rendering:

```typescript
import { render } from '@react-email/components'
import { EbookPurchaseEmail } from '@/emails/ebook-purchase'

const html = await render(<EbookPurchaseEmail {...props} />)
```

`src/lib/email.tsx` (not `.ts` — extension must be `.tsx` to allow JSX in the render calls). The `render()` call is awaited — it is async.

### 3.7 `/pricing` Page Data Fetching

`/pricing` is a **Server Component** with `export const dynamic = 'force-dynamic'` (not ISR) because it must check if the current user is already a member at request time. The monthly/annual toggle is client-side state in a `<PricingCards>` Client Component.

Data fetched on the server:
- Current user via `supabase.auth.getUser()`.
- If user exists: `isActiveMember(user.id)` result.

Pricing amounts ($15/month, $129/year) are **hardcoded constants** — not fetched from Stripe or DB. They are display values that must match the actual Stripe prices.

### 3.8 Checkout Error Handling

API routes return: `{ error: string }` with appropriate HTTP status code.

Client behavior after calling checkout API:
- If response is not ok: parse `{ error }`, display inline below button as `<p className="mt-2 text-sm text-red-500">{error}</p>`.
- If response is ok: `window.location.href = data.url`.
- During fetch: button disabled with loading spinner (Lucide `Loader2` icon with `animate-spin`).

### 3.9 Download Flow

`/api/ebooks/[id]/download` verifies ownership, generates a signed URL (1 hour expiry), calls the `increment_download_count` RPC, and returns a `307` redirect to the signed URL.

`/ebooks/download/[id]` page renders the ebook info and a `<DownloadButton>` which is simply an `<a href="/api/ebooks/{ebookId}/download">` styled as a button. The browser follows the 307 redirect automatically — no fetch needed client-side.

### 3.10 WARN-3 — `invoice.paid` Entries Dedup Lookup (Phase 4A Documentation)

Exact lookup path for Phase 4A:
1. From `invoice.paid`, get `invoice.subscription` (Stripe subscription ID string).
2. Query `subscriptions WHERE stripe_subscription_id = invoice.subscription` to get `user_id`.
3. Query `orders WHERE user_id = <user_id> AND entries_awarded_by_checkout = true AND is_subscription_renewal = false ORDER BY created_at ASC LIMIT 1`. This is the original combined checkout order.
4. If that order exists: the entries were already awarded at checkout time — skip for Phase 4A dedup.
5. Phase 3 stub: log `// TODO Phase 4A: award sweepstake entries (renewal). Dedup: query subscriptions.user_id via invoice.subscription, then orders where entries_awarded_by_checkout=true AND is_subscription_renewal=false`.

### 3.11 Beehiiv Unsubscribe Endpoint (WARN-5 Resolution)

Unsubscribe: `DELETE /v2/publications/{pub_id}/subscriptions/by_email/{encodedEmail}`. HTTP 404 treated as success (subscriber may not exist). Non-blocking guard on `BEEHIIV_API_KEY`.

---

## 4. New Migration Files

### `supabase/migrations/20240101000015_claim_stripe_event_fn.sql`

```sql
-- Phase 3: Billing — claim_stripe_event RPC for idempotent webhook processing

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS TABLE(event_id TEXT) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.processed_stripe_events (event_id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (event_id) DO NOTHING
  RETURNING public.processed_stripe_events.event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### `supabase/migrations/20240101000016_increment_download_count_fn.sql`

```sql
-- Phase 3: Billing — atomic download count increment

CREATE OR REPLACE FUNCTION public.increment_download_count(
  p_user_id UUID,
  p_ebook_id UUID
)
RETURNS void AS $$
BEGIN
  UPDATE public.user_ebooks
  SET
    download_count = download_count + 1,
    last_downloaded_at = now()
  WHERE user_id = p_user_id AND ebook_id = p_ebook_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 5. API Contract

### 5.1 `POST /api/checkout/membership`

**Auth:** Cookie-based `createClient()` → `getUser()`. Return `401 { error: 'Unauthorized' }` if no user.

**Request body:** `{ plan: 'monthly' | 'annual' }`

**Validation:** Return `400 { error: 'Invalid plan' }` if `plan` is not `'monthly'` or `'annual'`.

**Logic:**
1. Query `adminClient.from('subscriptions').select('id').eq('user_id', userId).in('status', ['trialing', 'active']).maybeSingle()`. If row exists: return `400 { error: 'You already have an active membership' }`.
2. `await getOrCreateStripeCustomer(userId, user.email)`.
3. Read `rewardful_referral` cookie from request headers. Pass as `client_reference_id` only if non-empty.
4. `priceId = plan === 'monthly' ? process.env.STRIPE_MONTHLY_PRICE_ID : process.env.STRIPE_ANNUAL_PRICE_ID`.
5. `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], subscription_data: { trial_period_days: 7 }, allow_promotion_codes: true, customer: stripeCustomerId, success_url: `${origin}/library?checkout=success`, cancel_url: `${origin}/pricing?checkout=canceled`, ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}) })`.
6. Return `200 { url: session.url }`.

**Error handling:** Wrap Stripe call in try/catch. On Stripe error: return `500 { error: 'Checkout session creation failed' }`.

---

### 5.2 `POST /api/checkout/ebook`

**Auth:** Return `401` if no user.

**Request body:** `{ ebookId: string, couponCode?: string }`

**Logic:**
1. `adminClient.from('ebooks').select('id, product_id, products!inner(id, slug, stripe_price_id, stripe_member_price_id, price_cents, title)').eq('id', ebookId).single()`. Return `404 { error: 'E-book not found' }` if no row.
2. `const isMember = await isActiveMember(userId)`. `priceId = isMember ? product.stripe_member_price_id : product.stripe_price_id`.
3. If `couponCode` provided: run same validation logic as §5.4. If invalid: return `400 { error: validationMessage }`. If valid: store `couponId`.
4. `await getOrCreateStripeCustomer(userId, user.email)`.
5. Read `rewardful_referral` cookie.
6. Session metadata: `{ ebook_id: ebookId, user_id: userId, is_member_price: String(isMember), ...(couponId ? { coupon_id: couponId, coupon_code: couponCode!.toUpperCase() } : {}) }`.
7. `stripe.checkout.sessions.create({ mode: 'payment', line_items: [{ price: priceId, quantity: 1 }], allow_promotion_codes: true, customer: stripeCustomerId, success_url: `${origin}/ebooks/download/${ebookId}?checkout=success`, cancel_url: `${origin}/library/${product.slug}?checkout=canceled`, metadata })`.
8. Return `200 { url: session.url }`.

---

### 5.3 `POST /api/checkout/ebook-with-membership`

**Auth:** Return `401` if no user.

**Request body:** `{ ebookId: string, plan: 'monthly' | 'annual' }`

**Logic:**
1. Pre-check existing active subscription — return `400 { error: 'You already have an active membership' }` if found.
2. `adminClient.from('ebooks').select('id, products!inner(id, title, stripe_member_price_id)').eq('id', ebookId).single()`. Return `404` if not found.
3. `await getOrCreateStripeCustomer(userId, user.email)`.
4. Read `rewardful_referral` cookie.
5. `membershipPriceId = plan === 'monthly' ? process.env.STRIPE_MONTHLY_PRICE_ID : process.env.STRIPE_ANNUAL_PRICE_ID`.
6. `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: membershipPriceId, quantity: 1 }, { price: product.stripe_member_price_id, quantity: 1 }], subscription_data: { trial_period_days: 7 }, allow_promotion_codes: true, customer: stripeCustomerId, metadata: { ebook_id: ebookId, user_id: userId, is_member_price: 'true' }, success_url: `${origin}/library?checkout=success`, cancel_url: `${origin}/library?checkout=canceled`, ...(clientReferenceId ? { client_reference_id: clientReferenceId } : {}) })`.
7. Return `200 { url: session.url }`.

---

### 5.4 `POST /api/coupons/validate`

**Auth:** Return `401` if no user.

**Request body:** `{ code: string }`

**Logic:**
1. `adminClient.from('coupons').select('id, code, entry_type, entry_value, is_active, expires_at, max_uses_global, current_uses, max_uses_per_user').eq('code', code.toUpperCase().trim()).maybeSingle()`.
2. No row: `{ valid: false, message: 'Invalid coupon code' }`.
3. `!coupon.is_active`: `{ valid: false, message: 'Coupon is inactive' }`.
4. `coupon.expires_at && new Date(coupon.expires_at) <= new Date()`: `{ valid: false, message: 'Coupon has expired' }`.
5. `coupon.max_uses_global !== null && coupon.current_uses >= coupon.max_uses_global`: `{ valid: false, message: 'Coupon has reached its usage limit' }`.
6. Per-user: `adminClient.from('coupon_uses').select('id', { count: 'exact', head: true }).eq('coupon_id', coupon.id).eq('user_id', userId)`. If `count >= coupon.max_uses_per_user`: `{ valid: false, message: 'You have already used this coupon' }`.
7. Return `200 { valid: true, coupon: { id, entry_type, entry_value, code: coupon.code } }`.

---

### 5.5 `POST /api/webhooks/stripe`

**Auth:** None (public). Route handler must export:
```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

**Body parsing:**
```typescript
const rawBody = await request.text()
const buf = Buffer.from(rawBody)
const sig = request.headers.get('stripe-signature') ?? ''
```

**Signature verification:** Return `400 { error: 'Invalid signature' }` on failure.

**Idempotency check:**
```typescript
const { data: claimed } = await adminClient.rpc('claim_stripe_event', {
  p_event_id: event.id,
  p_event_type: event.type,
})
if (!claimed || claimed.length === 0) {
  return NextResponse.json({ received: true }, { status: 200 })
}
```

**All event handler DB writes are wrapped in try/catch with compensating delete:**
```typescript
try {
  // ... DB writes
} catch (err) {
  console.error('[webhook] error processing event', event.id, err)
  await adminClient.from('processed_stripe_events').delete().eq('event_id', event.id)
  return NextResponse.json({ error: 'Internal error' }, { status: 500 })
}
// external HTTP calls (non-blocking) after try block
```

**`checkout.session.completed`:**

Resolve `userId`: `session.metadata?.user_id` OR query `adminClient.from('profiles').select('id').eq('stripe_customer_id', session.customer).single()` → use `profile.id`.

If `session.mode === 'payment'`:
- Build `discountCents = session.total_details?.breakdown?.discounts?.reduce((s, d) => s + d.amount, 0) ?? 0`.
- Query ebook+product: `adminClient.from('ebooks').select('id, product_id, products!inner(id, title, price_cents)').eq('id', session.metadata.ebook_id).single()`.
- Insert `orders`: `{ user_id, stripe_checkout_session_id: session.id, status: 'completed', subtotal_cents: session.amount_subtotal, discount_cents, total_cents: session.amount_total, is_member_discount: session.metadata.is_member_price === 'true', coupon_id: session.metadata.coupon_id ?? null, coupon_code: session.metadata.coupon_code ?? null, entries_awarded_by_checkout: false }`. Capture returned `id` as `newOrderId`.
- Insert `order_items`: `{ order_id: newOrderId, product_id: ebook.product_id, product_type: 'ebook', product_title: ebook.products.title, quantity: 1, unit_price_cents: session.amount_total, list_price_cents: ebook.products.price_cents }`.
- Insert `user_ebooks`: `{ user_id, ebook_id: session.metadata.ebook_id, order_id: newOrderId }`.
- `// TODO Phase 4A: award sweepstake entries (ebook purchase)`.
- After try block: `sendEmail('ebook_purchase', userEmail, { ... }).catch(console.error)` (fire-and-forget).

If `session.mode === 'subscription'` (combined checkout):
- Insert `orders` with `entries_awarded_by_checkout: true`, `status: 'completed'`. Capture `newOrderId`.
- Resolve ebook + product same as above.
- Insert `order_items` for e-book line.
- Insert `user_ebooks`.
- Retrieve full subscription from Stripe: `const sub = await stripe.subscriptions.retrieve(session.subscription as string)`.
- Upsert `subscriptions`: `{ user_id, stripe_subscription_id: sub.id, stripe_customer_id: sub.customer as string, product_id (resolve via price ID — see subscription.created handler), status: sub.status, trial_start: sub.trial_start ? toISO(sub.trial_start) : null, trial_end: sub.trial_end ? toISO(sub.trial_end) : null, current_period_start: toISO(sub.current_period_start), current_period_end: toISO(sub.current_period_end), cancel_at_period_end: sub.cancel_at_period_end }` ON CONFLICT `stripe_subscription_id`.
- `// TODO Phase 4A: award sweepstake entries (combined checkout — entries_awarded_by_checkout=true)`.

Helper: `function toISO(unixSeconds: number): string { return new Date(unixSeconds * 1000).toISOString() }`.

**`customer.subscription.created`:**
- If `sub.status` not in `['trialing', 'active']`: return `200` immediately.
- Resolve `userId`: query `adminClient.from('profiles').select('id, email').eq('stripe_customer_id', sub.customer as string).single()`.
- Resolve `productId`: `adminClient.from('products').select('id').or(`stripe_price_id.eq.${sub.items.data[0].price.id},stripe_member_price_id.eq.${sub.items.data[0].price.id}`).maybeSingle()`. Use `STRIPE_MONTHLY_PRICE_ID` or `STRIPE_ANNUAL_PRICE_ID` as fallback match if product not found via price ID (subscription products may not be in `products` table — see note below).

**Note on subscription product_id:** Membership subscription price IDs (`STRIPE_MONTHLY_PRICE_ID`, `STRIPE_ANNUAL_PRICE_ID`) are env vars pointing to Stripe prices. The `products` table already has two membership rows seeded in `20240101000014_seed_data.sql`:
- `type = 'membership_monthly'`, slug `omni-membership-monthly`
- `type = 'membership_annual'`, slug `omni-membership-annual`

The `product_type` ENUM (`20240101000001_enums.sql`) already includes `'membership_monthly'` and `'membership_annual'`.

**Resolution for `customer.subscription.created`:** Resolve `productId` by checking `sub.items.data[0].price.id` against `process.env.STRIPE_MONTHLY_PRICE_ID` and `process.env.STRIPE_ANNUAL_PRICE_ID`:
```typescript
const priceId = sub.items.data[0].price.id
const isMonthly = priceId === process.env.STRIPE_MONTHLY_PRICE_ID
const { data: memProduct } = await adminClient
  .from('products')
  .select('id')
  .eq('type', isMonthly ? 'membership_monthly' : 'membership_annual')
  .single()
const productId = memProduct?.id
```
If `productId` is still null (env vars not set or Stripe price doesn't match known IDs), fall back to querying `products.stripe_price_id = priceId`. If still null, log error and return 500 (this indicates a configuration problem).

- Upsert `subscriptions` ON CONFLICT `stripe_subscription_id`.
- After try block: `sendEmail('membership_welcome', profile.email, { displayName, trialEndDate, libraryUrl: `${origin}/library` }).catch(console.error)`, `subscribeToBeehiiv(profile.email).catch(console.error)`.

**`customer.subscription.updated`:**
- `const sub = event.data.object as Stripe.Subscription`.
- Resolve `productId` from `sub.items.data[0].price.id`.
- `adminClient.from('subscriptions').update({ status: sub.status, current_period_start: toISO(sub.current_period_start), current_period_end: toISO(sub.current_period_end), cancel_at_period_end: sub.cancel_at_period_end, product_id }).eq('stripe_subscription_id', sub.id)`.

**`customer.subscription.deleted`:**
- `adminClient.from('subscriptions').update({ status: 'canceled', canceled_at: sub.canceled_at ? toISO(sub.canceled_at) : new Date().toISOString() }).eq('stripe_subscription_id', sub.id)`.
- Resolve user email via profile lookup.
- After try block: `unsubscribeFromBeehiiv(userEmail).catch(console.error)`.

**`customer.subscription.trial_will_end`:**
- Resolve user email via profile lookup.
- After try block: `sendEmail('trial_ending', userEmail, { trialEndDate: toISO(sub.trial_end!), portalUrl: `${origin}/profile/subscription` }).catch(console.error)`.

**`invoice.paid`:**
- `const invoice = event.data.object as Stripe.Invoice`.
- If `invoice.amount_paid === 0`: return `200`.
- If `invoice.billing_reason === 'subscription_update'` and all line items have `type === 'invoiceitem'` (proration-only): return `200`.
- Lookup subscription: `adminClient.from('subscriptions').select('user_id, id').eq('stripe_subscription_id', invoice.subscription as string).single()`.
- Update subscription: `adminClient.from('subscriptions').update({ status: 'active' }).eq('stripe_subscription_id', invoice.subscription as string)`.
- Resolve user email via `adminClient.from('profiles').select('email').eq('id', sub.user_id).single()`.
- Insert `orders`: `{ user_id: sub.user_id, stripe_invoice_id: invoice.id, status: 'completed', subtotal_cents: invoice.subtotal, discount_cents: 0, total_cents: invoice.amount_paid, is_subscription_renewal: true, entries_awarded_by_checkout: false }`.
- `// TODO Phase 4A: award sweepstake entries (renewal — dedup: query subscriptions.user_id via invoice.subscription, then orders where entries_awarded_by_checkout=true AND is_subscription_renewal=false LIMIT 1)`.
- After try block: `sendEmail('membership_charged', userEmail, { amountCents: invoice.amount_paid, nextBillingDate: toISO(invoice.period_end) }).catch(console.error)`.

**`invoice.payment_failed`:**
- `adminClient.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', invoice.subscription as string)`.
- Resolve user email.
- After try block: `sendEmail('payment_failed', userEmail, { portalUrl: `${origin}/profile/subscription` }).catch(console.error)`.

---

### 5.6 `GET /api/profile/orders`

**Auth:** Return `401` if no user.

**Query params:** `page` (integer, default 1).

**Logic:**
```typescript
const pageNum = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
const offset = (pageNum - 1) * 20
const { data, count } = await adminClient
  .from('orders')
  .select('*, order_items(*)', { count: 'exact' })
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .range(offset, offset + 19)
```

**Response:** `{ orders: Order[], hasMore: boolean, total: number }`.

---

### 5.7 `GET /api/profile/ebooks`

**Auth:** Return `401` if no user.

**Logic:**
```typescript
const { data } = await adminClient
  .from('user_ebooks')
  .select('ebook_id, created_at, ebooks!inner(id, authors, products!inner(id, title, cover_image_url, slug))')
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
```
Deduplicate in JS: `Map<string, row>` keyed on `ebook_id` — first occurrence wins.

**Response:** `{ ebooks: OwnedEbook[] }`.

---

### 5.8 `GET /api/profile/subscription`

**Auth:** Return `401` if no user.

**Logic:**
```typescript
const { data } = await adminClient
  .from('subscriptions')
  .select('status, current_period_end, trial_end, cancel_at_period_end, products!inner(title)')
  .eq('user_id', userId)
  .in('status', ['trialing', 'active', 'past_due', 'canceled'])
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

**Response:** `{ subscription: { status, plan: data.products.title, trial_end, current_period_end, cancel_at_period_end } | null }`.

---

### 5.9 `POST /api/subscription/portal`

**Auth:** Return `401` if no user.

**Logic:**
1. `adminClient.from('profiles').select('stripe_customer_id').eq('id', userId).single()`.
2. If `!profile.stripe_customer_id`: return `400 { error: 'No Stripe customer found' }`.
3. `stripe.billingPortal.sessions.create({ customer: profile.stripe_customer_id, return_url: `${origin}/profile/subscription` })`.
4. Return `200 { url: session.url }`.

---

### 5.10 `GET /api/ebooks/[id]/download`

**Auth:** Return `401` if no user.

**Path param:** `[id]` = `ebooks.id` (UUID).

**Logic:**
1. `adminClient.from('user_ebooks').select('id').eq('user_id', userId).eq('ebook_id', id).maybeSingle()`. If null: `403 { error: 'You do not own this e-book' }`.
2. `adminClient.from('ebooks').select('file_path').eq('id', id).single()`.
3. `adminClient.storage.from('ebooks').createSignedUrl(ebook.file_path, 3600)`. If error or no data: `500 { error: 'Could not generate download link' }`.
4. `adminClient.rpc('increment_download_count', { p_user_id: userId, p_ebook_id: id })`.
5. `return NextResponse.redirect(signedUrl, { status: 307 })`.

---

## 6. New Lib Files

### `src/lib/membership.ts`

Export `isActiveMember(userId: string): Promise<boolean>`.
Uses `adminClient`. Queries `subscriptions` where `user_id = userId AND status IN ('trialing', 'active')`. Returns `!!data`.

### `src/lib/beehiiv.ts`

Exports:
- `subscribeToBeehiiv(email: string): Promise<void>`
- `unsubscribeFromBeehiiv(email: string): Promise<void>`

Both guarded with `!process.env.BEEHIIV_API_KEY || !process.env.BEEHIIV_PUBLICATION_ID` — log warning and return early.

Subscription endpoint: `POST https://api.beehiiv.com/v2/publications/{BEEHIIV_PUBLICATION_ID}/subscriptions`
Body: `{ email, reactivate_existing: true }`

Unsubscribe endpoint: `DELETE https://api.beehiiv.com/v2/publications/{BEEHIIV_PUBLICATION_ID}/subscriptions/by_email/{encodeURIComponent(email)}`
HTTP 404 treated as success. All errors caught and logged — never re-thrown.

### `src/lib/email.tsx` (note: `.tsx` extension)

Exports `sendEmail(template: TemplateKey, to: string, data: Record<string, unknown>, userId?: string): Promise<void>`.

Guard: `!process.env.RESEND_API_KEY` — log warning and return early.

Internal subject map for all 5 templates. After `resend.emails.send()`, log to `email_log` via `adminClient`. All errors caught and logged — never re-thrown.

### Additions to `src/lib/stripe.ts`

Add `getOrCreateStripeCustomer(userId: string, email: string): Promise<string>` function. Uses `getStripe()` (existing private function). If `!getStripe()` throw `Error('Stripe not configured')`. Queries `profiles.stripe_customer_id`, creates Stripe customer if absent, writes back to DB, returns customer ID.

Do NOT redeclare `getStripe`, `_stripe`, `syncStripeProduct`, or `syncStripeNewPrices`.

---

## 7. React Email Templates — `src/emails/`

All files are `.tsx`. Use `@react-email/components` primitives: `Html`, `Head`, `Body`, `Container`, `Text`, `Button`, `Hr`, `Heading`, `Section`, `Preview`.

### `src/emails/ebook-purchase.tsx`
**Props:** `{ ebookTitle: string, downloadUrl: string, orderNumber: string, totalCents: number }`
Content: Thank you message, order number, ebook title, total paid (format as `$X.XX`), Download Now button (`href = downloadUrl`), entries placeholder: "You've earned entries in the current Omni Sweepstake — check your dashboard soon."

### `src/emails/membership-welcome.tsx`
**Props:** `{ displayName: string, trialEndDate: string, libraryUrl: string }`
Content: Welcome to Omni Membership, what's included (50% off ebooks, sweepstake entries, library access), trial end date, Go to Library button.

### `src/emails/membership-charged.tsx`
**Props:** `{ amountCents: number, nextBillingDate: string }`
Content: Membership renewed, amount charged, next billing date, entries placeholder: "Your monthly sweepstake entries have been credited."

### `src/emails/trial-ending.tsx`
**Props:** `{ trialEndDate: string, portalUrl: string }`
Content: Free trial ending in 3 days, what happens (subscription starts automatically), Manage Subscription link (`href = portalUrl`).

### `src/emails/payment-failed.tsx`
**Props:** `{ portalUrl: string }`
Content: Payment failed notice, action required, Update Payment Method button (`href = portalUrl`).

---

## 8. Frontend Component Specifications

### `src/components/billing/pricing-cards.tsx` — Client Component

**Props:** `{ isActiveMember: boolean, userId: string | null }`

**State:** `plan: 'monthly' | 'annual'` (default `'monthly'`), `loading: boolean`, `error: string | null`

**Renders:**
- Toggle: two buttons styled as tab switcher — Monthly / Annual (updates `plan` state).
- Two cards (or single prominent card for the active plan):
  - Monthly card: $15/month, "Start free 7-day trial"
  - Annual card: $129/year, ~$10.75/month, "Save 28%", "Start free 7-day trial"
- If `isActiveMember`: show `<p>You are already a member.</p>` — no Join Now button.
- If `!userId`: `<a href="/login?next=/pricing">` styled as primary button.
- If `userId && !isActiveMember`: `<button onClick={handleJoin}>Join Now</button>` — calls `POST /api/checkout/membership { plan }`.
- Error: `<p className="mt-2 text-sm text-red-500">{error}</p>` below button.
- Loading: Lucide `Loader2` spinner inside button, button disabled.

### `src/components/billing/checkout-button.tsx` — Client Component

**Props:**
```typescript
interface CheckoutButtonProps {
  ebookId: string
  ebookSlug: string
  userId: string | null
  isMember: boolean
  withMembership: boolean
  plan?: 'monthly' | 'annual'
  couponCode?: string
  listPriceCents: number
  memberPriceCents: number
}
```

**Behavior:**
- Displays price: `withMembership ? memberPriceCents + $15/mo` or `isMember ? memberPriceCents : listPriceCents`.
- If `!userId`: renders `<a href="/login?next=/library/{ebookSlug}">Buy — $X.XX</a>` styled as button.
- If `userId`: on click, POST to appropriate checkout endpoint.
- Loading: spinner + disabled.
- Success: `window.location.href = data.url`.
- Error: inline red text below button.

### `src/components/billing/download-button.tsx` — Client Component (simple anchor)

**Props:** `{ ebookId: string, label?: string }`

Renders: `<a href={/api/ebooks/${ebookId}/download} className="...">Download E-book</a>`. No fetch needed — browser follows 307 redirect automatically.

### `src/components/billing/manage-subscription-btn.tsx` — Client Component

**Props:** `{ }`

On click: `POST /api/subscription/portal`. On success: `window.location.href = data.url`. Loading state with spinner.

### `src/components/ebook/ebook-detail.tsx` — MODIFY

Replace the disabled placeholder `<button>Buy — (Coming Soon)</button>` with `<CheckoutButton>`.

The parent server page (`/library/[slug]/page.tsx`) must additionally:
1. Pass `ebook.id` as a prop (`ebookId`) alongside the existing `product` prop.
2. Call `isActiveMember(user?.id ?? '')` and pass `isMember` boolean prop. (Guard: if no user, `isMember = false`.)
3. Pass `userId: user?.id ?? null`.

Within `ebook-detail.tsx`:
- Add coupon code input field below the membership upsell checkbox. On blur or 500ms debounce after typing, call `POST /api/coupons/validate`. Show inline validation result (green checkmark for valid, red X + message for invalid).
- Pass `couponCode` to `<CheckoutButton>`.
- Pass `withMembership={membershipChecked}` to `<CheckoutButton>`.

### `/pricing/page.tsx` — REPLACE (Server Component)

```typescript
export const dynamic = 'force-dynamic'
```

Imports: `isActiveMember` from `@/lib/membership`, `createClient` from `@/lib/supabase/server`.

Server-side: get user, call `isActiveMember` if user exists. Pass `isActiveMember` and `userId` to `<PricingCards>` Client Component.

### `/ebooks/download/[id]/page.tsx` — NEW (Server Component)

Auth protection via middleware (requires adding `/ebooks/download` to protected paths — see §9).

Server-side data:
- Fetch ebook + product metadata via `adminClient`.
- Check ownership via `adminClient` (user ID from `createClient().auth.getUser()`).
- Read `searchParams.checkout` for success message.

Renders:
- Cover image (if available), title, description.
- If `?checkout=success`: success banner (shadcn `Alert` component, green/emerald style).
- If user owns ebook: `<DownloadButton ebookId={id} />`.
- If user does not own: message "You do not own this e-book." with link to `/library`.

### `/profile/orders/page.tsx` — NEW (Server Component)

Auth protected by middleware.

Server-side: query `adminClient.from('orders').select('*, order_items(*)').eq('user_id', userId).order('created_at', {ascending: false}).range(0, 19)` plus total count.

Renders `<OrderHistory initialOrders={orders} total={count} />` Client Component.

`<OrderHistory>` Client Component (in `src/components/billing/order-history.tsx`):
- Table with columns: Order Number, Date, Total, Status.
- Each row has a disclosure toggle revealing line items table (product title, quantity, unit price).
- Status badge: use shadcn `Badge` with variant based on status.
- "Load More" button fetches `/api/profile/orders?page=N` and appends.

### `/profile/ebooks/page.tsx` — NEW (Server Component)

Auth protected by middleware.

Server-side: query ebooks via `adminClient`, deduplicate by `ebook_id` in JS.

Renders a grid (CSS grid, 2-3 cols) of ebook cards. Each card: cover image, title, `<DownloadButton ebookId={ebook.id} />`.

### `/profile/subscription/page.tsx` — NEW (Server Component)

Auth protected by middleware.

Server-side: query subscription via `adminClient`.

Renders:
- If no subscription: "You don't have an active membership." with link to `/pricing`.
- If subscription: plan name, status badge, trial end (if trialing), next billing date, cancel notice (if `cancel_at_period_end`).
- `<ManageSubscriptionBtn />` Client Component.

---

## 9. Middleware Update — Add `/ebooks/download` Protection

**File:** `src/middleware.ts` — MODIFY.

Add a protected route block:
```typescript
if (pathname.startsWith('/ebooks/download')) {
  if (!user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(redirectUrl)
  }
}
```

Place this block after the existing `/profile` guard and before the `/admin` guard.

---

## 10. Environment Variables

New variables required for Phase 3:

| Variable | Required | Guard behavior |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Yes (hard fail) | Webhook returns 400 if absent |
| `STRIPE_MONTHLY_PRICE_ID` | Yes (hard fail) | Checkout throws if absent |
| `STRIPE_ANNUAL_PRICE_ID` | Yes (hard fail) | Checkout throws if absent |
| `RESEND_API_KEY` | Non-blocking | Skip email, log warning |
| `RESEND_FROM_EMAIL` | Optional | Default: `noreply@omniincubator.org` |
| `BEEHIIV_API_KEY` | Non-blocking | Skip Beehiiv, log warning |
| `BEEHIIV_PUBLICATION_ID` | Non-blocking | Skip Beehiiv, log warning |

---

## 11. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| TypeScript | Full type coverage. `npx tsc --noEmit` must pass 0 errors. |
| Build | `npm run build` must pass with no errors. |
| Webhook runtime | `export const runtime = 'nodejs'` + `export const dynamic = 'force-dynamic'` on webhook route. |
| Stripe API version | Use existing `'2026-03-25.dahlia'` from `src/lib/stripe.ts` — do NOT change. |
| Idempotency | Webhook returns 200 on duplicate event_id. Failure in DB side effects deletes event claim and returns 500. |
| External calls | Beehiiv and Resend calls execute AFTER try block completes. Never inside DB write block. Fire-and-forget with `.catch(console.error)`. |
| Admin client | All webhook and checkout server-side DB writes use `adminClient`. |
| Coupon normalization | All coupon code lookups use `.toUpperCase().trim()` before querying. |
| Pricing display | Hardcode $15/mo and $129/yr in `PricingCards`. Do not fetch from DB or Stripe. |
| Rewardful | Read cookie via `request.cookies.get('rewardful_referral')?.value`. Omit `client_reference_id` entirely if empty. |
| shadcn/ui | Use existing components: `Badge`, `Button`, `Alert`, `Card`. Do not install new shadcn components unless listed components are insufficient. |
| No new packages | All required packages already installed. Do not add new npm dependencies. |
| Membership product row | `subscriptions.product_id` is NOT NULL. Backend agent must ensure a `products` row with `type = 'membership'` exists before webhook can write subscriptions. Verify in `20240101000014_seed_data.sql` or add it. |

---

## 12. WARN Resolutions Summary

| Finding | Decision |
|---|---|
| WARN-1: Transaction mechanism | `supabase.rpc('claim_stripe_event')` + compensating delete on failure. Migration `20240101000015`. |
| WARN-2: Combined checkout race | Both `checkout.session.completed` and `customer.subscription.created` handlers use upsert ON CONFLICT stripe_subscription_id. Welcome email only from subscription.created handler. |
| WARN-3: Invoice.paid dedup lookup | Phase 3 stubs with comment. Full lookup path documented in §3.10. |
| WARN-4: discount_cents null breakdown | `?.breakdown?.discounts?.reduce(...) ?? 0` pattern. |
| WARN-5: Beehiiv unsubscribe | `DELETE .../by_email/{encoded_email}`. 404 = success. Non-blocking guard. |
| WARN-6: is_member_discount | Store `is_member_price: 'true'/'false'` in checkout session metadata. Webhook reads from metadata. |
