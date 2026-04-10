# PRD Report — Phase 3: Billing
**PRD Agent Output — Fortification Mode**
**Date:** 2026-04-09
**Phase:** 3 — Billing

---

## 1. Status

**WARN**

Requirements are complete and internally consistent. Six advisory findings are noted below — none are blocking. The Architect may proceed. All findings should be addressed during implementation.

---

## 2. Fortified Requirements

### R1 — Stripe Customer Management
`getOrCreateStripeCustomer(userId: string, email: string): Promise<string>` in `src/lib/stripe.ts`:
- Use `adminClient` (service role) exclusively — bypasses RLS.
- Query `profiles.stripe_customer_id` where `id = userId`. If non-null and non-empty, return it immediately.
- If absent: call `stripe.customers.create({ email, metadata: { supabase_user_id: userId } })`. Write the resulting customer ID back to `profiles.stripe_customer_id`. Return the new ID.
- Function must be server-only. Never import in client components.

### R2 — Member Pricing Utility
`isActiveMember(userId: string): Promise<boolean>` in `src/lib/membership.ts`:
- Query `subscriptions` where `user_id = userId AND status IN ('trialing', 'active')` using `adminClient`.
- Return `true` if at least one row exists, `false` otherwise.
- Called server-side only — before checkout and on product detail pages.

### R3 — Membership Checkout
`POST /api/checkout/membership` — auth required (reject with 401 if no session).
- Body schema: `{ plan: 'monthly' | 'annual' }`. Return 400 if `plan` is neither value.
- Pre-check: query `subscriptions` where `user_id = userId AND status IN ('trialing', 'active')`. If a row exists, return `400 { error: 'You already have an active membership' }`.
- Call `getOrCreateStripeCustomer(userId, email)`.
- Read Rewardful referral cookie `rewardful_referral` from request cookies. Pass its value as `clientReferenceId` on the Checkout Session (omit field entirely if cookie is absent).
- Create Stripe Checkout Session:
  - `mode: 'subscription'`
  - `line_items`: `plan === 'monthly'` → `[{ price: STRIPE_MONTHLY_PRICE_ID, quantity: 1 }]`; `plan === 'annual'` → `[{ price: STRIPE_ANNUAL_PRICE_ID, quantity: 1 }]`
  - `subscription_data: { trial_period_days: 7 }`
  - `allow_promotion_codes: true`
  - `customer: stripeCustomerId`
  - `success_url: /library?checkout=success`
  - `cancel_url: /pricing?checkout=canceled`
- Return `200 { url: checkoutSession.url }`.

### R4 — E-book Checkout
`POST /api/checkout/ebook` — auth required.
- Body schema: `{ ebookId: string, couponCode?: string }`.
- Determine price: `isActiveMember(userId)` → use `products.stripe_member_price_id`; otherwise use `products.stripe_price_id`. Both values are read from the `products` row (no JS price computation — Phase 2 constraint).
- If `couponCode` is provided: apply the same validation logic as R6. If invalid, return 400 with the validation message. If valid, store `coupon_id` in Checkout Session metadata.
- Read Rewardful referral cookie — pass as `clientReferenceId` if present.
- Create Stripe Checkout Session:
  - `mode: 'payment'`
  - `line_items: [{ price: resolvedPriceId, quantity: 1 }]`
  - `allow_promotion_codes: true`
  - `customer: stripeCustomerId`
  - `success_url: /ebooks/download/{ebookId}?checkout=success`
  - `cancel_url: /library/{slug}?checkout=canceled`
  - `metadata: { ebook_id: ebookId, user_id: userId, coupon_id: <if provided>, coupon_code: <if provided> }`
- No duplicate purchase block — same e-book may be purchased multiple times.
- Return `200 { url: checkoutSession.url }`.

### R5 — E-book + Membership Upsell Checkout
`POST /api/checkout/ebook-with-membership` — auth required.
- Body schema: `{ ebookId: string, plan: 'monthly' | 'annual' }`.
- Pre-check: no existing active/trialing subscription (same check as R3). Return 400 if found.
- Call `getOrCreateStripeCustomer(userId, email)`.
- Read Rewardful referral cookie.
- Create Stripe Checkout Session:
  - `mode: 'subscription'`
  - `line_items`: `[{ price: STRIPE_MONTHLY_PRICE_ID, quantity: 1 }, { price: products.stripe_member_price_id, quantity: 1 }]` (membership subscription line + e-book at member price as one-time add-on)
  - `subscription_data: { trial_period_days: 7 }`
  - `allow_promotion_codes: true`
  - `metadata: { ebook_id: ebookId, user_id: userId }`
- Return `200 { url: checkoutSession.url }`.

### R6 — Coupon Validation API
`POST /api/coupons/validate` — auth required.
- Body schema: `{ code: string }`.
- Lookup: `UPPER(code)` match against `coupons.code`. Conditions for validity (all must be true):
  1. `is_active = true`
  2. `expires_at IS NULL OR expires_at > now()`
  3. `max_uses_global IS NULL OR current_uses < max_uses_global`
  4. Per-user: count of `coupon_uses` rows where `coupon_id = X AND user_id = Y` is less than `coupons.max_uses_per_user`
- Success response: `{ valid: true, coupon: { id, entry_type, entry_value, code } }`
- Failure response: `{ valid: false, message: '<reason>' }`
- This endpoint validates entry bonus coupons only. Price discounts are Stripe Promotion Codes — this endpoint does not validate or process those.

### R7 — Processed Stripe Events Table
The `processed_stripe_events` table already exists. It was created in Phase 1 migration `supabase/migrations/20240101000008_email_stripe_tables.sql` with columns: `event_id TEXT PRIMARY KEY`, `event_type TEXT NOT NULL`, `processed_at TIMESTAMPTZ DEFAULT now()`.

No new migration is required for this table. The PRD note "create migration if not exists" is confirmed resolved — the table exists in Phase 1.

### R8 — Stripe Webhook Handler
`POST /api/webhooks/stripe` — public endpoint (no auth cookie), Stripe signature verified.

**Signature verification:** `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`. The raw body must be read as a `Buffer`/`Uint8Array` before any parsing — do not call `request.json()` first. Return `400` on verification failure.

**Transactional idempotency (§13.1 pattern):** The entire event handler body runs inside a single database transaction. First operation inside the transaction:
```sql
INSERT INTO processed_stripe_events (event_id, event_type)
VALUES ($1, $2)
ON CONFLICT DO NOTHING
RETURNING event_id
```
If no rows returned: event already processed — return `200` immediately. If rows returned: proceed with all side effects. If any side effect throws, the transaction rolls back (including the event ID insertion), allowing Stripe to retry successfully.

**Important:** External HTTP calls (Beehiiv, Resend) must NOT be inside the DB transaction. They execute after the transaction commits.

**Events to handle (all 7):**

**`checkout.session.completed`:**
- Look up `user_id` from `session.metadata.user_id` (set at checkout creation) OR by querying `profiles` where `stripe_customer_id = session.customer`.
- If `mode = 'payment'`:
  - Create `orders` row (status = `completed`, `entries_awarded_by_checkout = false`) with fields per R9.
  - Create `order_items` row(s).
  - Create `user_ebooks` row linking `user_id` and the `ebook_id` from session metadata.
  - After transaction: send `ebook_purchase` email (non-blocking — guard on `RESEND_API_KEY`).
  - Log `// TODO Phase 4A: award sweepstake entries` at entry-awarding callsite.
- If `mode = 'subscription'` (combined ebook + membership checkout):
  - Create `orders` row with `entries_awarded_by_checkout = true` and `status = 'completed'`.
  - Create `order_items` row for the e-book line.
  - Create `user_ebooks` row.
  - Upsert `subscriptions` row (handles out-of-order arrival with `customer.subscription.created`).
  - Log `// TODO Phase 4A: award sweepstake entries` at entry-awarding callsite.
- Return `200`.

**`customer.subscription.created`:**
- Only process if `event.data.object.status IN ('trialing', 'active')`. Skip silently (return 200) if `status = 'incomplete'`.
- Upsert `subscriptions` row: `stripe_subscription_id`, `stripe_customer_id`, `user_id`, `product_id` (resolve from price ID), `status`, `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `cancel_at_period_end`.
- After transaction: send `membership_welcome` email (non-blocking). Subscribe to Beehiiv (non-blocking).

**`customer.subscription.updated`:**
- Update `subscriptions` row by `stripe_subscription_id`: `status`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `product_id`.

**`customer.subscription.deleted`:**
- Update `subscriptions` row: `status = 'canceled'`, `canceled_at = event.data.object.canceled_at` (converted to TIMESTAMPTZ).
- After transaction: unsubscribe from Beehiiv (non-blocking).

**`customer.subscription.trial_will_end`:**
- After transaction: send `trial_ending` email to subscription owner (non-blocking).

**`invoice.paid`:**
- Check `invoice.amount_paid > 0` — if zero, return `200` immediately (skip $0 trial invoice).
- Check `invoice.billing_reason === 'subscription_update'` with no recurring line items — if proration-only, return `200` (skip).
- Look up `subscriptions` row by `invoice.subscription`. Update `status = 'active'`.
- Look up any `orders` row associated with this subscription that has `entries_awarded_by_checkout = true`. Store this finding for Phase 4A stub (log it, do not gate on it for DB writes in Phase 3).
- Create `orders` row with `is_subscription_renewal = true`, `status = 'completed'`, `stripe_invoice_id = invoice.id`.
- Log `// TODO Phase 4A: award sweepstake entries (check entries_awarded_by_checkout dedup flag)`.
- After transaction: send `membership_charged` email (non-blocking).

**`invoice.payment_failed`:**
- Update `subscriptions` row by `invoice.subscription`: `status = 'past_due'`.
- After transaction: send `payment_failed` email (non-blocking).

### R9 — Order Creation Logic
On `checkout.session.completed`, insert into `orders`:
- `user_id`: from metadata or customer lookup
- `stripe_checkout_session_id`: `session.id`
- `status`: `'completed'`
- `subtotal_cents`: `session.amount_subtotal`
- `discount_cents`: sum of amounts from `session.total_details.breakdown.discounts` (Stripe Promotion Code discounts). Default to `0` if `breakdown` is null.
- `total_cents`: `session.amount_total`
- `is_member_discount`: `true` if e-book was purchased at member price (see WARN-6 for implementation note)
- `coupon_id`: from `session.metadata.coupon_id` (UUID string, nullable)
- `coupon_code`: from `session.metadata.coupon_code` (text, nullable)
- `order_number`: auto-generated by DB trigger — do NOT set manually; insert with `order_number = DEFAULT` or omit the column

Insert into `order_items`:
- `order_id`: new order's ID
- `product_id`: `products.id` (resolved from `ebook_id` in metadata via `ebooks.product_id`)
- `product_type`: snapshot of `products.type` (e.g., `'ebook'`)
- `product_title`: snapshot of `products.title` at time of purchase
- `quantity`: `1`
- `unit_price_cents`: actual amount paid (from session line item amounts)
- `list_price_cents`: `products.price_cents` (full non-member price, read from DB)

### R10 — Profile: Order History
`GET /api/profile/orders` — auth required.
- Query params: `page` (integer, default `1`). Page size: `20`.
- Returns orders where `user_id = auth.uid()`, ordered by `created_at DESC`.
- Each order includes nested `order_items` array.
- Response: `{ orders: Order[], hasMore: boolean, total: number }`.

`/profile/orders` page — auth required:
- Paginated list of orders. Each row: order number, formatted date, total amount, status badge.
- Expandable to show line items: product title, quantity, unit price.

### R11 — Profile: My E-books
`GET /api/profile/ebooks` — auth required.
- Returns distinct ebooks owned by user — one entry per unique `ebook_id` even if purchased multiple times.
- Each entry includes: `ebook_id`, product title, cover image URL, authors.

`/profile/ebooks` page — auth required:
- Grid of owned e-books: cover, title, Download button per card.
- Download button links to `/ebooks/download/{ebook_id}` or calls `GET /api/ebooks/[id]/download`.

### R12 — E-book Download
`GET /api/ebooks/[id]/download` — auth required.
- Path param `[id]` is `ebooks.id` (UUID).
- Ownership check: query `user_ebooks` where `user_id = auth.uid() AND ebook_id = id`. If no row: return `403 { error: 'You do not own this e-book' }`.
- Generate signed URL: `adminClient.storage.from('ebooks').createSignedUrl(ebook.file_path, 3600)` (1 hour expiry).
- Increment: `UPDATE user_ebooks SET download_count = download_count + 1, last_downloaded_at = now() WHERE user_id = auth.uid() AND ebook_id = id`.
- Redirect `307` to signed URL.

`/ebooks/download/[id]` page — auth required:
- Path param `[id]` is `ebooks.id`.
- Fetches product/ebook metadata. Renders cover, title, Download button.
- Detect `?checkout=success` URL param and show success confirmation message.

### R13 — Subscription Management
`GET /api/profile/subscription` — auth required.
- Returns: `{ subscription: { status, plan, trial_end, current_period_end, cancel_at_period_end } | null }`.

`/profile/subscription` page — auth required:
- Displays plan name, status badge (active / trialing / canceled / past_due), trial end date (if trialing), next billing date (`current_period_end`), cancel notice if `cancel_at_period_end = true`.
- "Manage Subscription" button calls `POST /api/subscription/portal` and redirects.

`POST /api/subscription/portal` — auth required:
- Fetches `profiles.stripe_customer_id`.
- Calls `stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: '<origin>/profile/subscription' })`.
- Returns `200 { url: portalSession.url }`.

### R14 — Beehiiv Integration
Utility in `src/lib/beehiiv.ts`:
- `subscribeToBeehiiv(email: string): Promise<void>`: POST to Beehiiv subscriptions API. Bearer auth with `BEEHIIV_API_KEY`.
- `unsubscribeFromBeehiiv(email: string): Promise<void>`: DELETE/unsubscribe from Beehiiv API.
- Guard: if `!process.env.BEEHIIV_API_KEY`, log warning to console and return. Non-blocking.
- Both functions called after transaction commits — not inside DB transaction.

### R15 — Transactional Emails (Resend)
`src/lib/email.ts`:
- Resend client + `sendEmail(template: string, to: string, data: Record<string, unknown>): Promise<void>`.
- After sending, log to `email_log` via `adminClient`.
- Guard: if `!process.env.RESEND_API_KEY`, log warning and skip. Non-blocking.

React Email templates in `src/emails/`:
- `EbookPurchaseEmail`: order details, stable download link `/ebooks/download/{ebook_id}` (NOT a signed URL), entries placeholder text.
- `MembershipWelcomeEmail`: membership benefits, trial end date, link to `/library`.
- `MembershipChargedEmail`: invoice amount, next billing date, entries placeholder text.
- `TrialEndingEmail`: trial ends in 3 days, what happens next, link to Stripe Portal.
- `PaymentFailedEmail`: payment failed message, link to Stripe Portal.

The `entry_awarded` template is deferred to Phase 4A.

### R16 — Wire Buy Buttons
`/library/[slug]` (e-book detail page):
- Replace placeholder Buy CTA with functional button.
- Not logged in → redirect to `/login?next=/library/{slug}`.
- Logged in → call `POST /api/checkout/ebook` and redirect to returned URL.
- Membership upsell toggle (Phase 2 UI element): when toggled on, call `POST /api/checkout/ebook-with-membership` instead.
- Keep "You already own this e-book" note when applicable; keep Buy button active per blueprint policy.

`/pricing` page:
- Replace Phase 1 placeholder with full implementation.
- Monthly/annual toggle (client-side state).
- Pricing cards: Monthly at $15/month, Annual at $129/year. Both show "Start free 7-day trial".
- "Join Now" button calls `POST /api/checkout/membership` with correct `plan` value.
- Not logged in → redirect to `/login?next=/pricing`.
- Already a member → show "You are already a member" instead of Join Now.

---

## 3. Acceptance Criteria

1. `POST /api/checkout/membership` returns `400 { error: 'You already have an active membership' }` when user has a `trialing` or `active` subscription.
2. `POST /api/checkout/membership` returns `200 { url }` with a valid Stripe Checkout Session URL.
3. `POST /api/checkout/ebook` uses `products.stripe_member_price_id` for active/trialing members and `products.stripe_price_id` for non-members.
4. `POST /api/checkout/ebook` stores `coupon_id` in session metadata when a valid entry bonus coupon code is supplied.
5. `POST /api/coupons/validate` returns `{ valid: true, coupon: { id, entry_type, entry_value, code } }` for a valid, unexpired, under-limit coupon.
6. `POST /api/coupons/validate` returns `{ valid: false, message: <reason> }` for an expired, inactive, or maxed-out coupon.
7. `POST /api/webhooks/stripe` returns `400` when the Stripe signature is invalid.
8. `POST /api/webhooks/stripe` returns `200` immediately without re-executing side effects when the same `event_id` is submitted twice (idempotency verified).
9. On `checkout.session.completed` (mode=payment): an `orders` row with `status=completed`, at least one `order_items` row, and a `user_ebooks` row are created.
10. On `checkout.session.completed` (mode=subscription, combined checkout): an `orders` row with `entries_awarded_by_checkout=true`, an `order_items` row, a `user_ebooks` row, and an upserted `subscriptions` row are created.
11. On `customer.subscription.created` (status=trialing or active): a `subscriptions` row exists in the database after the event.
12. On `customer.subscription.created` (status=incomplete): no `subscriptions` row is created and no email is sent.
13. On `customer.subscription.updated`: `subscriptions.status`, `current_period_start`, `current_period_end`, and `cancel_at_period_end` match the event payload.
14. On `customer.subscription.deleted`: `subscriptions.status = 'canceled'` and `canceled_at` is set.
15. On `invoice.paid` (amount_paid > 0, non-proration): an `orders` row with `is_subscription_renewal=true` is created and `subscriptions.status = 'active'`.
16. On `invoice.paid` (amount_paid = 0, trial invoice): no `orders` row is created.
17. On `invoice.payment_failed`: `subscriptions.status = 'past_due'` is set.
18. `GET /api/ebooks/[id]/download` returns `403` when the authenticated user has no `user_ebooks` row for the given `ebook_id`.
19. `GET /api/ebooks/[id]/download` returns a `307` redirect to a signed URL and increments `user_ebooks.download_count` for an owned e-book.
20. `/ebooks/download/[id]` page loads with e-book metadata and a Download button for an authenticated owner.
21. `/profile/orders` page renders paginated order history with expandable line items.
22. `/profile/ebooks` page shows deduplicated owned e-books (one per unique ebook even if purchased multiple times) with Download buttons.
23. `/profile/subscription` page displays current subscription status, plan, and a functional Manage Subscription button.
24. `POST /api/subscription/portal` returns `200 { url }` with a valid Stripe Billing Portal URL.
25. `/pricing` page renders with monthly/annual toggle and functional Join Now buttons.
26. `/library/[slug]` Buy button initiates checkout (redirects to Stripe Checkout or to login).
27. `npm run build` passes with no errors.
28. `npx tsc --noEmit` reports 0 errors.

---

## 4. Cross-Phase Dependencies

| Dependency | Source Phase | Binding Decision |
|---|---|---|
| All DB tables (orders, order_items, subscriptions, user_ebooks, processed_stripe_events, email_log, profiles, coupons) | Phase 1 | Table and column names are fixed — see §4.1 for confirmed column list. |
| `profiles.stripe_customer_id TEXT UNIQUE` | Phase 1 | Column exists, nullable. Write via admin client. |
| `subscriptions` unique index on `(user_id) WHERE status IN ('trialing', 'active')` | Phase 1 | DB enforces max one active subscription per user. API pre-check is defense-in-depth. |
| `orders.order_number` auto-generated by `generate_order_number` trigger | Phase 1 | Do not set `order_number` manually. Omit column or insert `DEFAULT`. |
| `products.member_price_cents` computed by DB trigger; never computed in application code | Phase 2 | Read from DB via `.select('member_price_cents')` after write. Never compute in JS. |
| `products.stripe_price_id` and `products.stripe_member_price_id` populated by Phase 2 Stripe sync | Phase 2 | Read from `products` table in checkout routes. |
| `src/lib/stripe.ts` exists with `stripe` instance and sync helpers | Phase 2 | Phase 3 adds `getOrCreateStripeCustomer` to this file. Do not redeclare the `stripe` instance. |
| `adminClient` from `src/lib/supabase/admin.ts` | Phase 1 | All webhook and checkout DB operations use admin client. |
| Auth middleware protects `/profile/*` routes | Phase 1 | No additional middleware needed for new profile routes. |

### 4.1 Confirmed DB Column Names (verified against migration SQL)

**`orders`:** `id`, `order_number`, `user_id`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `stripe_invoice_id`, `coupon_id`, `coupon_code`, `stripe_promotion_code`, `status`, `subtotal_cents`, `discount_cents`, `total_cents`, `is_member_discount`, `is_subscription_renewal`, `entries_awarded_by_checkout`, `notes`, `created_at`, `updated_at`

**`order_items`:** `id`, `order_id`, `product_id`, `product_type`, `product_title`, `quantity`, `unit_price_cents`, `list_price_cents`, `created_at`

**`subscriptions`:** `id`, `user_id`, `stripe_subscription_id`, `stripe_customer_id`, `product_id`, `status`, `trial_start`, `trial_end`, `current_period_start`, `current_period_end`, `cancel_at_period_end`, `canceled_at`, `created_at`, `updated_at`

**`user_ebooks`:** `id`, `user_id`, `ebook_id`, `order_id`, `download_count`, `last_downloaded_at`, `created_at`

**`processed_stripe_events`:** `event_id` (PK), `event_type`, `processed_at`

**`coupons`:** `id`, `code`, `name`, `entry_type` (ENUM: `'multiplier'`, `'fixed_bonus'`), `entry_value`, `max_uses_global`, `max_uses_per_user`, `current_uses`, `is_active`, `expires_at`, `created_at`

---

## 5. Scope Boundaries

The following are explicitly OUT of scope for Phase 3:

- **Sweepstake entry awarding:** Webhook handlers must log `// TODO Phase 4A: award sweepstake entries` at the entry callsite. No `sweepstake_entries` rows are created.
- **`entry_awarded` email template:** Phase 4A.
- **Lead capture API** (`POST /api/lead-capture`): Phase 4A.
- **Entry badge live calculations:** Phase 4A.
- **`MultiplierBanner` component activation:** Phase 4A.
- **Admin order management pages** (`/admin/orders`): Phase 4B.
- **Admin user management pages** (`/admin/users`): Phase 4B.
- **Production Stripe live keys:** External task E13.
- **Stripe webhook endpoint registration in Stripe Dashboard:** External task E6.
- **Beehiiv account setup:** External task E8 — integration code is written in Phase 3 with the non-blocking guard.
- **Resend domain verification:** External task E9 — email code is written in Phase 3 with the non-blocking guard.
- **Plan switching UI:** Handled by Stripe Customer Portal.
- **Cancellation UI:** Handled by Stripe Customer Portal.
- **Payment method update UI:** Handled by Stripe Customer Portal.

---

## 6. Findings

### WARN-1: Transaction Mechanism for Supabase JS Client Not Specified
**Risk level: Medium — must be resolved by Architect.**
The blueprint §13.1 requires wrapping the webhook handler in a database transaction. The Supabase JS client (`adminClient`) does not provide a native multi-statement transaction API. The Architect must choose and specify the exact mechanism: (a) a Postgres stored function wrapping the idempotency check + all side effects, (b) direct connection via the `pg` Node.js client using the Supabase connection string, or (c) the Supabase `rpc()` call for the idempotency INSERT + separate atomic writes with application-level compensating logic. The PRD requirement for transactional idempotency is non-negotiable — this is a WHAT that the Architect must solve in HOW.

### WARN-2: Combined Checkout UPSERT Race Condition on `subscriptions`
**Risk level: Low — must be addressed in implementation.**
Both `checkout.session.completed` (mode=subscription) and `customer.subscription.created` may fire within milliseconds for the same subscription. Both handlers must UPSERT (not INSERT) the `subscriptions` row using `ON CONFLICT (stripe_subscription_id) DO UPDATE`. The Architect must ensure both handlers use this pattern to prevent duplicate-row errors or lost writes.

### WARN-3: `invoice.paid` Entries Dedup Flag — Lookup Path
**Risk level: Low — advisory for Phase 3 stub, critical for Phase 4A.**
R8 specifies checking the `entries_awarded_by_checkout` flag on `invoice.paid` to prevent double-awarding entries on combined checkouts. The Stripe `invoice` object does not directly contain the original checkout session ID. The lookup requires: `invoice.subscription` → find `orders` where `stripe_checkout_session_id` matches the session that created this subscription. This join path is complex. For Phase 3, the stub only needs to log the TODO. The Architect must document the exact lookup logic here so Phase 4A can implement it correctly.

### WARN-4: `discount_cents` — Null `breakdown` Path
**Risk level: Low — explicit handling required.**
`session.total_details.breakdown` is only populated when a Stripe Promotion Code discount was applied. If no discount was used, `breakdown` is `null`. The code must default `discount_cents = 0` when `breakdown` is null or when `breakdown.discounts` is an empty array. Failing to handle this will produce a null reference error on non-discounted purchases.

### WARN-5: Beehiiv Unsubscribe Endpoint
**Risk level: Low — non-blocking.**
The blueprint references a Beehiiv unsubscribe endpoint but the exact path for the Beehiiv v2 API is not confirmed in the blueprint. The Backend agent must verify the correct Beehiiv API endpoint at implementation time. The non-blocking guard (`!BEEHIIV_API_KEY`) means an incorrect endpoint only produces a logged warning in development. This does not block Phase 3 delivery.

### WARN-6: `is_member_discount` Determination at Webhook Time
**Risk level: Low — implementation choice.**
The webhook handler must set `orders.is_member_discount = true` when the e-book was purchased at member price. The most reliable approach is to store `is_member_price: 'true'` in the Stripe Checkout Session metadata at checkout creation time — since a user's subscription status could theoretically change between checkout creation and webhook delivery, reading it from metadata is more accurate than re-querying at webhook time. The Architect should specify storing this flag in session metadata in R4/R5. Either approach is acceptable; this is flagged to ensure a deliberate decision is made.
