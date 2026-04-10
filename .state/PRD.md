# PRD — Phase 3: Billing

## Phase Goal
Build the complete purchase and subscription flow so that a user can buy an e-book, join a membership (with 7-day free trial), or buy both together. Webhooks process Stripe events into orders, subscriptions, and download access. Transactional emails send on key events. Users can manage their subscription, view orders, download purchased e-books.

## Requirements

### R1 — Stripe Customer Management
- Utility `getOrCreateStripeCustomer(userId, email)` in `src/lib/stripe.ts`:
  - Check `profiles.stripe_customer_id` — if exists, return it
  - If not: `stripe.customers.create({ email, metadata: { supabase_user_id: userId } })`, update `profiles.stripe_customer_id`, return new ID
  - Use admin Supabase client (bypasses RLS)

### R2 — Member Pricing Utility
- `isActiveMember(userId)` in `src/lib/membership.ts`:
  - Query `subscriptions` where `user_id = userId AND status IN ('trialing', 'active')`
  - Return boolean
  - This function is called before checkout and on product detail pages to determine pricing tier

### R3 — Membership Checkout
- `POST /api/checkout/membership`: auth required
  - Pre-check: query subscriptions — if user already has status IN ('trialing', 'active'), return 400 with message "You already have an active membership"
  - Body: `{ plan: 'monthly' | 'annual' }`
  - Get/create Stripe customer
  - Read Rewardful referral cookie `rewardful_referral` → pass as `clientReferenceId` on session
  - Create Stripe Checkout Session:
    - mode: 'subscription'
    - line_items: monthly → STRIPE_MONTHLY_PRICE_ID, annual → STRIPE_ANNUAL_PRICE_ID
    - subscription_data: { trial_period_days: 7 }
    - allow_promotion_codes: true
    - customer: stripe_customer_id
    - success_url: /library?checkout=success
    - cancel_url: /pricing?checkout=canceled
  - Return { url: checkoutSession.url }

### R4 — E-book Checkout
- `POST /api/checkout/ebook`: auth required
  - Body: `{ ebookId: string, couponCode?: string }`
  - Determine pricing: if `isActiveMember(userId)` → use `stripe_member_price_id`, else use `stripe_price_id`
  - If couponCode provided: validate via internal coupon lookup (case-insensitive, active, not expired, not over max_uses). Store coupon_id in session metadata.
  - Read Rewardful referral cookie
  - Create Stripe Checkout Session:
    - mode: 'payment'
    - line_items: [{ price: priceId, quantity: 1 }]
    - allow_promotion_codes: true
    - customer: stripe_customer_id
    - success_url: /ebooks/download/{ebookId}?checkout=success
    - cancel_url: /library/{slug}?checkout=canceled
    - metadata: { ebook_id: ebookId, coupon_id, coupon_code, user_id }
  - No duplicate purchase block — same e-book can be bought multiple times
  - Return { url: checkoutSession.url }

### R5 — E-book + Membership Upsell Checkout
- `POST /api/checkout/ebook-with-membership`: auth required
  - Body: `{ ebookId: string, plan: 'monthly' | 'annual' }`
  - Pre-check: no existing active subscription
  - Get/create Stripe customer
  - Read Rewardful referral cookie
  - Create Stripe Checkout Session:
    - mode: 'subscription'
    - line_items: [{ price: STRIPE_MONTHLY_PRICE_ID, quantity: 1 }, { price: stripe_member_price_id, quantity: 1 }]
    - subscription_data: { trial_period_days: 7 }
    - allow_promotion_codes: true
    - metadata: { ebook_id: ebookId, user_id }
  - Return { url: checkoutSession.url }

### R6 — Coupon Validation API
- `POST /api/coupons/validate`: auth required
  - Body: `{ code: string }`
  - Look up coupon (case-insensitive UPPER(code) match), verify: is_active, not expired (expires_at IS NULL OR expires_at > now()), current_uses < max_uses_global (if set)
  - Check per-user usage: query coupon_uses where coupon_id = X AND user_id = Y, count < max_uses_per_user
  - Return: `{ valid: true, coupon: { id, entry_type, entry_value, code } }` or `{ valid: false, message: string }`
  - Price discounts are handled by Stripe Promotion Codes natively — this endpoint only validates ENTRY BONUS coupons

### R7 — Processed Events Table Migration
- Migration file: `supabase/migrations/20240101000015_processed_stripe_events.sql`
- Wait — this table was ALREADY included in Phase 1 migrations. Verify it exists. If not, create the migration.

### R8 — Stripe Webhook Handler
- `POST /api/webhooks/stripe`: public, no auth cookie check, Stripe signature verification
- Verify signature: `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)` — return 400 on failure
- Transactional idempotency per §13.1: entire handler wrapped in a DB transaction. First operation: `INSERT INTO processed_stripe_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id`. If no rows returned, event already processed — return 200 immediately.
- Handle these events:

**checkout.session.completed:**
- Look up user_id from session metadata or customer
- If mode='payment': create Order (status=completed) + OrderItems + UserEbook row. Send ebook_purchase email. Award sweepstake entries (Phase 4A will wire this — for now, log a TODO).
- If mode='subscription' with one-time items (combined checkout): also create Order/UserEbook for the e-book line. Set `entries_awarded_by_checkout = true` on the order.
- On combined checkout: also handle subscription creation (upsert subscriptions row)

**customer.subscription.created:**
- Only if `status IN ('trialing', 'active')`: upsert subscriptions row. Send membership_welcome email. Subscribe to Beehiiv.
- Skip if `status = 'incomplete'` (card declined)

**customer.subscription.updated:**
- Update subscription fields: status, current_period_start/end, cancel_at_period_end, product_id

**customer.subscription.deleted:**
- Set subscription status = 'canceled', set canceled_at. Remove from Beehiiv.

**customer.subscription.trial_will_end:**
- Send trial_ending email (fires 3 days before trial ends)

**invoice.paid:**
- Check `invoice.amount_paid > 0` (skip $0 trial invoices)
- Skip if `invoice.billing_reason = 'subscription_update'` (proration-only, no recurring line items)
- Check `entries_awarded_by_checkout` flag on related order (if exists) to avoid double-counting combined checkout
- Update subscription status to 'active'
- Create Order with `is_subscription_renewal = true`
- Award sweepstake entries (Phase 4A — log TODO for now)
- Send membership_charged email with entry count placeholder

**invoice.payment_failed:**
- Update subscription status to 'past_due'. Send payment_failed email.

### R9 — Order Creation Logic
- On checkout.session.completed: create orders row with:
  - order_number (auto-generated by DB trigger)
  - stripe_checkout_session_id
  - user_id
  - status: 'completed'
  - subtotal_cents: from session.amount_subtotal
  - discount_cents: from session.total_details.breakdown.discounts (Stripe Promotion Code discounts)
  - total_cents: from session.amount_total
  - is_member_discount: true if member price was used
  - coupon_id/coupon_code from session metadata (entry bonus coupon)
- Create order_items rows with: product_id, product_type, product_title (snapshot), quantity, unit_price_cents (actual paid), list_price_cents (full list price)

### R10 — Profile: Order History
- `GET /api/profile/orders`: auth required. Paginated (20 per page), ordered by created_at desc. Returns orders with nested order_items.
- `/profile/orders` page: paginated list, expandable line items, order status badge, formatted date, order number display.

### R11 — Profile: My E-books
- `GET /api/profile/ebooks`: auth required. Returns distinct ebooks owned by user (deduplicated — one entry per unique ebook even if purchased multiple times). Includes ebook metadata + product title/cover.
- `/profile/ebooks` page: grid of owned e-books with title, cover, download button.

### R12 — E-book Download
- `GET /api/ebooks/[id]/download`: auth required + ownership check (query user_ebooks where user_id = auth AND ebook_id = id)
  - If not owned: return 403
  - Generate signed URL (1 hour expiry) from `ebooks` bucket for `ebooks.file_path`
  - Increment `user_ebooks.download_count`, update `last_downloaded_at`
  - Redirect (307) to signed URL
- `/ebooks/download/[id]` page: auth required. Fetches ebook metadata. Shows cover, title, "Download" button (hits download API). Also served as checkout success_url.

### R13 — Subscription Management
- `GET /api/profile/subscription`: auth required. Returns current subscription (status, plan, trial_end, current_period_end, cancel_at_period_end).
- `/profile/subscription` page: shows plan name, status badge (active/trialing/canceled/past_due), trial end date (if trialing), next billing date. "Manage Subscription" button → calls POST /api/subscription/portal.
- `POST /api/subscription/portal`: auth required. Creates Stripe billing portal session (`stripe.billingPortal.sessions.create({ customer: stripe_customer_id, return_url: /profile/subscription })`). Returns { url }. Redirect on client.

### R14 — Beehiiv Integration
- On subscription.created (status trialing/active): `POST https://api.beehiiv.com/v2/publications/{BEEHIIV_PUBLICATION_ID}/subscriptions` with `{ email, reactivate_existing: true }`
- On subscription.deleted: `DELETE https://api.beehiiv.com/v2/publications/{BEEHIIV_PUBLICATION_ID}/subscriptions/by_email/{email}` (or equivalent unsubscribe endpoint)
- Guard: if `!BEEHIIV_API_KEY`, log warning and skip (non-blocking)
- Utility in `src/lib/beehiiv.ts`

### R15 — Transactional Emails (Resend)
- `src/lib/email.ts`: Resend client + `sendEmail(template, to, data)` function. Log every sent email to `email_log` table (use admin client).
- Templates (React Email components in `src/emails/`):
  - `EbookPurchaseEmail`: Order details, stable download link `/ebooks/download/{id}` (NOT signed URL), entries placeholder
  - `MembershipWelcomeEmail`: What's included, trial end date, link to library
  - `MembershipChargedEmail`: Invoice amount, next billing date, entries placeholder
  - `TrialEndingEmail`: Trial ends in 3 days, what happens next, cancel link
  - `PaymentFailedEmail`: Payment failed, link to Stripe Portal to update payment method
- Guard: if `!RESEND_API_KEY`, log and skip (non-blocking for dev — real emails require configured key)

### R16 — Wire Buy Buttons
- Update `/library/[slug]` (ebook detail page): Buy button now calls `POST /api/checkout/ebook`. If user not logged in, redirect to `/login?next=/library/{slug}`. Show membership upsell toggle that switches between `/api/checkout/ebook` and `/api/checkout/ebook-with-membership`.
- Update `/pricing` page: Add membership pricing cards with monthly/annual toggle, "Join Now" button calling `POST /api/checkout/membership`.
- Pricing page: show $15/month and $129/year with trial messaging "Start free 7-day trial".

## Acceptance Criteria
1. `POST /api/checkout/membership` returns 400 if user already has active subscription
2. `POST /api/checkout/membership` creates Stripe Checkout session and returns URL
3. `POST /api/checkout/ebook` applies member pricing for active members, full price for others
4. `POST /api/coupons/validate` returns valid:true for valid unexpired coupon, valid:false for invalid/expired/maxed
5. Webhook handler verifies Stripe signature — returns 400 on invalid sig
6. Webhook handler is idempotent: same event_id processed twice → second call returns 200 immediately without side effects
7. `checkout.session.completed` (payment mode): creates order, order_items, user_ebooks row
8. `customer.subscription.created`: creates subscriptions row, sends welcome email (if trialing/active)
9. `customer.subscription.updated`: updates subscription fields in DB
10. `customer.subscription.deleted`: sets status='canceled'
11. `invoice.paid` (amount>0): creates renewal order with is_subscription_renewal=true, sends charged email
12. `invoice.paid` ($0 trial): no order created, no entries awarded
13. `invoice.payment_failed`: sets subscription status='past_due', sends payment failed email
14. `GET /api/ebooks/[id]/download` returns 403 if user doesn't own the ebook
15. `GET /api/ebooks/[id]/download` generates signed URL and increments download_count for owned ebook
16. `/ebooks/download/[id]` page loads with ebook info and download button
17. `/profile/orders` shows paginated order history
18. `/profile/ebooks` shows deduplicated owned e-books with download buttons
19. `/profile/subscription` shows current plan status and Manage Subscription button
20. `POST /api/subscription/portal` creates Stripe portal session and returns URL
21. `/pricing` page renders with monthly/annual toggle and working Join Now buttons
22. `/library/[slug]` buy button triggers checkout flow
23. `npm run build` passes with no errors
24. `npx tsc --noEmit` passes with 0 errors

## Out of Scope for Phase 3
- Sweepstake entry awarding (webhook stubs log TODO — Phase 4A wires this)
- Lead capture API (Phase 4A)
- Entry badge live calculations (Phase 4A)
- Admin order management pages (Phase 4B)
- Admin user management (Phase 4B)
- Production Stripe live keys (EXTERNAL TASK E13)
