# QA Report — Phase 3: Billing
**QA Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing

---

**Overall result: PASS**

---

## Summary

All 28 acceptance criteria from PRD_REPORT.md verified. No defects found. TypeScript check and build both pass.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `npm run build` | PASS — compiled successfully, 34 routes |
| Acceptance criteria | 28/28 PASS |

---

## TypeScript Check

**Result: PASS**

Command: `node node_modules/typescript/bin/tsc --noEmit`
Output: no output (0 errors).

---

## Build Check

**Result: PASS**

Command: `NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_SITE_URL=https://omniincubator.org node node_modules/next/dist/bin/next build`

Output: `✓ Compiled successfully in 5.8s` — all 34 dynamic routes compiled including `/api/webhooks/stripe`, `/api/checkout/membership`, `/api/checkout/ebook`, `/api/coupons/validate`, `/api/ebooks/[id]/download`, `/ebooks/download/[id]`, `/profile/orders`, `/profile/ebooks`, `/profile/subscription`, `/pricing`. No build errors or warnings.

---

## Acceptance Criteria Validation

### AC-1: `POST /api/checkout/membership` returns 400 for existing active/trialing subscription

**PASS**

File: `src/app/api/checkout/membership/route.ts` lines 33–43.
Query: `.from('subscriptions').select('id').eq('user_id', user.id).in('status', ['trialing', 'active']).maybeSingle()`.
If `existingSub` is non-null: returns `NextResponse.json({ error: 'You already have an active membership' }, { status: 400 })`.

---

### AC-2: `POST /api/checkout/membership` returns 200 `{ url }` with Stripe Checkout Session URL

**PASS**

File: `src/app/api/checkout/membership/route.ts` lines 62–74.
Creates Stripe Checkout Session with `mode: 'subscription'`, `subscription_data: { trial_period_days: 7 }`, `allow_promotion_codes: true`, Rewardful `client_reference_id` support. Returns `NextResponse.json({ url: session.url })`.

---

### AC-3: `POST /api/checkout/ebook` uses member price for active/trialing members, full price for non-members

**PASS**

File: `src/app/api/checkout/ebook/route.ts` lines 55–60.
`isActiveMember(user.id)` called server-side; `priceId = isMember ? product.stripe_member_price_id : product.stripe_price_id`. Both values read from DB — no JS price computation.

---

### AC-4: `POST /api/checkout/ebook` stores `coupon_id` in session metadata when valid coupon supplied

**PASS**

File: `src/app/api/checkout/ebook/route.ts` lines 63–70 and 82–86.
`validateCouponCode(couponCode, user.id)` called from shared helper in `src/lib/coupon.ts`. If valid: `couponId = validationResult.coupon.id`. Metadata built at lines 82–86: `{ ...(couponId && couponCode ? { coupon_id: couponId, coupon_code: couponCode.toUpperCase() } : {}) }`. Both `coupon_id` and `coupon_code` stored in session metadata.

---

### AC-5: `POST /api/coupons/validate` returns `{ valid: true, coupon: { id, entry_type, entry_value, code } }` for valid coupon

**PASS**

File: `src/app/api/coupons/validate/route.ts` lines 59–67.
Returns `{ valid: true, coupon: { id, entry_type, entry_value, code } }` when all validity checks pass. Case-insensitive lookup via `normalizedCode = code.toUpperCase().trim()` matched against `coupons.code`.

---

### AC-6: `POST /api/coupons/validate` returns `{ valid: false, message }` for invalid coupon

**PASS**

File: `src/app/api/coupons/validate/route.ts` lines 31–57.
Four failure paths: coupon not found (line 33), `is_active = false` (line 36), expired `expires_at` (line 40), `current_uses >= max_uses_global` (line 44), per-user limit exceeded (line 55). All return `{ valid: false, message: '<reason>' }`.

---

### AC-7: `POST /api/webhooks/stripe` returns 400 when Stripe signature is invalid

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 72–81.
`rawBody = await request.text()` (not `json()`). `buf = Buffer.from(rawBody)`. `stripe.webhooks.constructEvent(buf, sig, STRIPE_WEBHOOK_SECRET)` — on exception: `return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })`.

---

### AC-8: `POST /api/webhooks/stripe` returns 200 immediately on duplicate event_id (idempotency)

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 84–91.
`adminClient.rpc('claim_stripe_event', { p_event_id, p_event_type })` called after signature verification. The RPC uses `INSERT ... ON CONFLICT DO NOTHING RETURNING event_id`. If `claimed` is empty or null, returns `NextResponse.json({ received: true }, { status: 200 })` immediately without executing any side effects.

Migration `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` confirmed: implements `INSERT ... ON CONFLICT (event_id) DO NOTHING RETURNING public.processed_stripe_events.event_id`.

---

### AC-9: `checkout.session.completed` (mode=payment) creates orders + order_items + user_ebooks rows

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 128–198.
- `orders` INSERT with `status: 'completed'`, `entries_awarded_by_checkout: false` (lines 153–168).
- `order_items` INSERT (lines 176–185).
- `user_ebooks` INSERT (lines 187–191).
- `// TODO Phase 4A: award sweepstake entries (ebook purchase)` stub present (line 193).
- Fire-and-forget `sendEmail('ebook_purchase', ...)` after DB writes (line 201).

---

### AC-10: `checkout.session.completed` (mode=subscription, combined) creates orders with `entries_awarded_by_checkout=true`, order_items, user_ebooks, and upserted subscriptions row

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 208–297.
- `orders` INSERT with `entries_awarded_by_checkout: true`, `status: 'completed'` (lines 215–228).
- `order_items` INSERT conditionally when `ebookId` present (lines 246–254).
- `user_ebooks` INSERT (lines 256–260).
- `subscriptions` UPSERT with `onConflict: 'stripe_subscription_id'` (lines 275–289) — handles race condition with `customer.subscription.created`.
- `// TODO Phase 4A: award sweepstake entries (combined checkout — entries_awarded_by_checkout=true)` stub present (line 292).

---

### AC-11: `customer.subscription.created` (status=trialing or active) creates subscriptions row

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 303–365.
Status check at line 306: `if (!['trialing', 'active'].includes(sub.status)) { return 200 }`. UPSERT at lines 333–347 with `onConflict: 'stripe_subscription_id'`. All required columns written: `user_id`, `stripe_subscription_id`, `stripe_customer_id`, `product_id`, `status`, `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `cancel_at_period_end`.

---

### AC-12: `customer.subscription.created` (status=incomplete) creates no subscriptions row and sends no email

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` line 306.
`if (!['trialing', 'active'].includes(sub.status))` returns `NextResponse.json({ received: true }, { status: 200 })` immediately. No DB write, no `sendEmail` call, no Beehiiv call for any non-trialing/active status.

---

### AC-13: `customer.subscription.updated` updates subscriptions.status, current_period_start, current_period_end, cancel_at_period_end

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 367–390.
Update payload: `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, plus `product_id` if resolvable. `.eq('stripe_subscription_id', sub.id)`.

---

### AC-14: `customer.subscription.deleted` sets subscriptions.status = 'canceled' and canceled_at

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 393–419.
Update: `{ status: 'canceled', canceled_at: sub.canceled_at ? toISO(sub.canceled_at) : new Date().toISOString() }`. Fire-and-forget `unsubscribeFromBeehiiv(profile.email)` after DB commit.

---

### AC-15: `invoice.paid` (amount_paid > 0, non-proration) creates orders row with `is_subscription_renewal=true` and sets subscriptions.status = 'active'

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 443–509.
- `if (invoice.amount_paid === 0) return 200` — skips $0 invoices (line 446).
- `if (invoice.billing_reason === 'subscription_update' && isAllProration(invoice)) return 200` — skips proration (line 451).
- `subscriptions` UPDATE to `status = 'active'` (lines 481–484).
- `orders` INSERT with `is_subscription_renewal: true`, `status: 'completed'`, `stripe_invoice_id: invoice.id` (lines 486–495).
- `// TODO Phase 4A: award sweepstake entries (renewal ...)` stub present (line 497).

---

### AC-16: `invoice.paid` (amount_paid = 0, trial invoice) creates no orders row

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` line 446.
`if (invoice.amount_paid === 0) { return NextResponse.json({ received: true }, { status: 200 }) }` — returns before any DB write.

---

### AC-17: `invoice.payment_failed` sets subscriptions.status = 'past_due'

**PASS**

File: `src/app/api/webhooks/stripe/route.ts` lines 514–544.
If `subscriptionId` present: `.from('subscriptions').update({ status: 'past_due' }).eq('stripe_subscription_id', subscriptionId)`. Fire-and-forget `sendEmail('payment_failed', ...)` after DB commit.

---

### AC-18: `GET /api/ebooks/[id]/download` returns 403 for non-owner

**PASS**

File: `src/app/api/ebooks/[id]/download/route.ts` lines 17–27.
Auth check at lines 9–12. Ownership query: `.from('user_ebooks').select('id').eq('user_id', user.id).eq('ebook_id', id).maybeSingle()`. If `!ownership`: `return NextResponse.json({ error: 'You do not own this e-book' }, { status: 403 })`.

---

### AC-19: `GET /api/ebooks/[id]/download` returns 307 redirect to signed URL and increments download_count

**PASS**

File: `src/app/api/ebooks/[id]/download/route.ts` lines 40–56.
- `adminClient.storage.from('ebooks').createSignedUrl(ebook.file_path, 3600)` — 1 hour signed URL.
- Fire-and-forget `adminClient.rpc('increment_download_count', { p_user_id: user.id, p_ebook_id: id })` (lines 49–53).
- `return NextResponse.redirect(signedData.signedUrl, { status: 307 })`.

Migration `supabase/migrations/20240101000016_increment_download_count_fn.sql` confirmed: `UPDATE user_ebooks SET download_count = download_count + 1, last_downloaded_at = now()`.

---

### AC-20: `/ebooks/download/[id]` page loads with ebook metadata and Download button for authenticated owner

**PASS**

File: `src/app/ebooks/download/[id]/page.tsx`.
- Auth check + redirect to `/login?next=/ebooks/download/${id}` if not logged in (lines 22–24).
- Fetches ebook metadata (title, cover, authors, description) via `adminClient` (lines 27–34).
- Ownership check via `user_ebooks` query (lines 44–49).
- Shows `<DownloadButton ebookId={id} label="Download E-book" />` for owners (line 100).
- Shows ownership error with library link for non-owners (lines 102–108).
- Shows `?checkout=success` success banner (lines 57–62).

---

### AC-21: `/profile/orders` page renders paginated order history with expandable line items

**PASS**

Files: `src/app/profile/orders/page.tsx` and `src/components/billing/order-history.tsx`.
- Page fetches first 20 orders with nested `order_items(*)`, passes to `<OrderHistory initialOrders={orders} total={total} />`.
- `OrderHistory` is a Client Component with shadcn Table, expandable rows showing line items, and Load More pagination calling `/api/profile/orders?page=N`.
- API route `src/app/api/profile/orders/route.ts` returns `{ orders, hasMore, total }` with correct pagination.

---

### AC-22: `/profile/ebooks` page shows deduplicated owned ebooks with Download buttons

**PASS**

File: `src/app/profile/ebooks/page.tsx` lines 24–32.
Deduplication via `Map<ebook_id, EbookRow>` — first occurrence wins. Each card shows `<DownloadButton ebookId={ebook.id} />`. API route `src/app/api/profile/ebooks/route.ts` also deduplicates server-side.

---

### AC-23: `/profile/subscription` page displays current subscription status, plan, and functional Manage Subscription button

**PASS**

File: `src/app/profile/subscription/page.tsx`.
- Shows plan name from `products.title` join (line 74).
- Status badge with `statusVariant()` mapping (active/trialing/past_due/canceled) (line 74).
- Trial end date shown when `status === 'trialing'` (lines 79–86).
- Next billing date shown when not canceled (lines 88–92).
- `cancel_at_period_end` warning shown (lines 95–102).
- `past_due` payment failure notice shown (lines 104–111).
- `<ManageSubscriptionBtn />` rendered (line 112).

---

### AC-24: `POST /api/subscription/portal` returns 200 `{ url }` with Stripe Billing Portal URL

**PASS**

File: `src/app/api/subscription/portal/route.ts`.
- Auth check (lines 16–18).
- Fetches `profiles.stripe_customer_id` (lines 21–28).
- `stripe.billingPortal.sessions.create({ customer, return_url: '{origin}/profile/subscription' })` (lines 35–38).
- Returns `NextResponse.json({ url: session.url })` (line 40).

---

### AC-25: `/pricing` page renders with monthly/annual toggle and functional Join Now buttons

**PASS**

Files: `src/app/pricing/page.tsx` and `src/components/billing/pricing-cards.tsx`.
- `force-dynamic`, fetches user + `isActiveMember`, passes to `<PricingCards>`.
- `PricingCards`: Monthly/Annual toggle (lines 66–91). $15/month and $129/year hardcoded. "Join Now — Free 7-Day Trial" button calls `POST /api/checkout/membership` with current `plan` value.
- Not logged in: redirects to `/login?next=/pricing` (line 35).
- Already a member: shows "You're already a member!" banner instead of Join Now (lines 128–138).

---

### AC-26: `/library/[slug]` Buy button initiates checkout

**PASS**

Files: `src/app/library/[slug]/page.tsx` and `src/components/ebook/ebook-detail.tsx`.
- `EbookDetailPage` passes `ebookId`, `isMember`, `userId` to `<EbookDetail>`.
- `<CheckoutButton>` rendered with `ebookId`, `userId`, `slug`, `isMember`, `withMembership` (membership upsell checkbox), `couponCode`.
- Not logged in (`userId === null`): `<CheckoutButton>` renders as login redirect link.
- Membership upsell checkbox triggers `POST /api/checkout/ebook-with-membership`.
- "You already own this e-book" note + `<DownloadButton>` shown for owners (lines 230–235).

---

### AC-27: `npm run build` passes with no errors

**PASS**

Build output: `✓ Compiled successfully in 5.8s`. All 34 routes compiled. No errors.

---

### AC-28: `npx tsc --noEmit` reports 0 errors

**PASS**

`node node_modules/typescript/bin/tsc --noEmit` produced no output (0 errors).

---

## Additional Spot Checks

| Check | Result | Evidence |
|---|---|---|
| `request.text()` used in webhook (not `json()`) | PASS | `route.ts` line 72 |
| `Buffer.from(rawBody)` passed to `constructEvent` | PASS | `route.ts` line 73, 78 |
| `supabase.rpc('claim_stripe_event', ...)` at start of handler | PASS | `route.ts` lines 84–91 |
| All 7 events handled | PASS | Switch cases cover all 7 |
| `entries_awarded_by_checkout: true` on combined checkout | PASS | `route.ts` line 225 |
| `invoice.paid` checks `amount_paid > 0` | PASS | `route.ts` line 446 |
| `invoice.paid` checks `billing_reason !== 'subscription_update'` proration skip | PASS | `route.ts` line 451 |
| Phase 4A TODO stubs — no actual entry logic | PASS | Lines 193, 292, 497 |
| Migration 20240101000015 exists | PASS | `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` |
| Migration 20240101000016 exists | PASS | `supabase/migrations/20240101000016_increment_download_count_fn.sql` |
| `vercel.json` maxDuration: 60 for webhook | PASS | `vercel.json` confirmed |
| Coupon validation case-insensitive | PASS | `code.toUpperCase().trim()` in both routes and `coupon.ts` |

---

## Defects Found

None.

---

## Notes

1. The `invoice.paid` handler uses a non-fatal pattern when the subscriptions row is not found (logs warning, returns 200 via `break`). This is a deliberate spec deviation documented in `BACKEND_DONE.md` — acceptable for Phase 3.

2. Stripe v22 API structural differences (`invoice.parent.subscription_details.subscription`, `sub.items.data[0].current_period_start/end`) are handled correctly via helper functions `getInvoiceSubscriptionId()`, `getSubPeriod()`, and `isAllProration()`.

3. The `/profile/subscription` page fetches subscription status directly via `adminClient` in the Server Component, consistent with the `/api/profile/subscription` endpoint shape.
