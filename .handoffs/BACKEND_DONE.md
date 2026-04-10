# BACKEND_DONE.md — Phase 3: Billing
**Backend Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing
**Status:** COMPLETE

---

## Build Verification

- `npx tsc --noEmit` — **0 errors**
- `npm run build` — **Success** (35 routes compiled, all dynamic)

---

## Files Created

### Migrations
- `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` — `claim_stripe_event` RPC for idempotent webhook processing
- `supabase/migrations/20240101000016_increment_download_count_fn.sql` — `increment_download_count` RPC for atomic download counting

### Library Files
- `src/lib/membership.ts` — `isActiveMember(userId)` server-only function
- `src/lib/beehiiv.ts` — `subscribeToBeehiiv(email)` and `unsubscribeFromBeehiiv(email)` with non-blocking guards
- `src/lib/email.tsx` — `sendEmail(template, to, data, userId?)` with Resend integration + email_log
- `src/lib/coupon.ts` — `validateCouponCode(code, userId)` shared helper (see Spec Deviations)

### React Email Templates
- `src/emails/ebook-purchase.tsx` — EbookPurchaseEmail (props: ebookTitle, downloadUrl, orderNumber, totalCents)
- `src/emails/membership-welcome.tsx` — MembershipWelcomeEmail (props: displayName, trialEndDate, libraryUrl)
- `src/emails/membership-charged.tsx` — MembershipChargedEmail (props: amountCents, nextBillingDate)
- `src/emails/trial-ending.tsx` — TrialEndingEmail (props: trialEndDate, portalUrl)
- `src/emails/payment-failed.tsx` — PaymentFailedEmail (props: portalUrl)

### API Routes
- `src/app/api/checkout/membership/route.ts` — POST /api/checkout/membership
- `src/app/api/checkout/ebook/route.ts` — POST /api/checkout/ebook
- `src/app/api/checkout/ebook-with-membership/route.ts` — POST /api/checkout/ebook-with-membership
- `src/app/api/coupons/validate/route.ts` — POST /api/coupons/validate
- `src/app/api/webhooks/stripe/route.ts` — POST /api/webhooks/stripe (full webhook handler)
- `src/app/api/profile/orders/route.ts` — GET /api/profile/orders
- `src/app/api/profile/ebooks/route.ts` — GET /api/profile/ebooks
- `src/app/api/profile/subscription/route.ts` — GET /api/profile/subscription
- `src/app/api/ebooks/[id]/download/route.ts` — GET /api/ebooks/[id]/download
- `src/app/api/subscription/portal/route.ts` — POST /api/subscription/portal

### Config
- `vercel.json` — maxDuration: 60 for `/api/webhooks/stripe`
- `.env.example` — All 7 new environment variables documented with comments

---

## Files Modified

- `src/lib/stripe.ts` — Appended `getOrCreateStripeCustomer(userId, email)` and `getStripeInstance()` exports; existing code untouched
- `src/middleware.ts` — Added `/ebooks/download` protection block between `/profile` and `/admin` guards

---

## Endpoints Implemented

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/checkout/membership | Cookie | Create Stripe subscription checkout (monthly/annual, 7-day trial, Rewardful support) |
| POST | /api/checkout/ebook | Cookie | Create Stripe payment checkout with optional coupon validation, member price detection |
| POST | /api/checkout/ebook-with-membership | Cookie | Combined subscription+ebook checkout in single Stripe session |
| POST | /api/coupons/validate | Cookie | Validate coupon: active, expiry, global limit, per-user limit checks |
| POST | /api/webhooks/stripe | None (sig) | Idempotent webhook handler for 7 Stripe event types |
| GET | /api/profile/orders | Cookie | Paginated order history with nested order_items (page param, 20/page) |
| GET | /api/profile/ebooks | Cookie | Deduplicated list of owned ebooks with product metadata |
| GET | /api/profile/subscription | Cookie | Current subscription status (trialing/active/past_due/canceled) or null |
| GET | /api/ebooks/[id]/download | Cookie | Ownership check + 1hr signed URL + download count increment, 307 redirect |
| POST | /api/subscription/portal | Cookie | Create Stripe billing portal session |

---

## Webhook Events Handled

| Event | DB Side Effects | External (fire-and-forget) |
|---|---|---|
| checkout.session.completed (payment) | INSERT order + order_items + user_ebooks | sendEmail('ebook_purchase') |
| checkout.session.completed (subscription) | INSERT order + order_items + user_ebooks + UPSERT subscriptions | — |
| customer.subscription.created | UPSERT subscriptions | sendEmail('membership_welcome'), subscribeToBeehiiv |
| customer.subscription.updated | UPDATE subscriptions | — |
| customer.subscription.deleted | UPDATE subscriptions status=canceled | unsubscribeFromBeehiiv |
| customer.subscription.trial_will_end | — | sendEmail('trial_ending') |
| invoice.paid | UPDATE subscriptions status=active, INSERT orders (renewal) | sendEmail('membership_charged') |
| invoice.payment_failed | UPDATE subscriptions status=past_due | sendEmail('payment_failed') |

---

## Spec Deviations

### 1. Coupon validation extracted to shared helper
Created `src/lib/coupon.ts` with `validateCouponCode()` instead of duplicating inline in both `checkout/ebook/route.ts` and `coupons/validate/route.ts`. Both routes call the same helper. This was explicitly noted in TASKS.md B9 as "Backend agent's choice."

### 2. Stripe v22 API structural differences
The SPEC was written against an older Stripe API shape. The installed `stripe@22.0.1` uses a different structure:

| SPEC reference | Actual v22 location |
|---|---|
| `sub.current_period_start` | `sub.items.data[0].current_period_start` |
| `sub.current_period_end` | `sub.items.data[0].current_period_end` |
| `invoice.subscription` | `invoice.parent.subscription_details.subscription` |
| `line.type === 'invoiceitem'` | `line.parent.type === 'invoice_item_details'` |

Added helper `getSubPeriod(sub)` to extract period dates from first subscription item. Added `getInvoiceSubscriptionId(invoice)` to extract subscription ID from nested `parent` field. Used `isAllProration(invoice)` checking `parent.type`.

### 3. `invoice.paid` subscription-not-found is non-fatal
If `invoice.paid` fires before `customer.subscription.created` (race condition), the subscription row won't exist in our DB yet. Rather than returning 500 (which causes Stripe to retry and may create duplicate records later), we log a warning and return 200 (`break` out of switch). The subscription.created handler will create the row when it arrives.

### 4. `increment_download_count` fire-and-forget pattern
Supabase PostgREST builder does not expose a `.catch()` method. Used `void rpc(...).then(({ error }) => { if (error) console.error(...) })` pattern for non-blocking execution.

---

## B2 — Membership Product UUIDs

UUIDs are dynamic (generated at DB initialization). To retrieve them after `supabase db push`:
```sql
SELECT id, type, slug FROM products WHERE type IN ('membership_monthly', 'membership_annual');
```

The webhook handler resolves these dynamically via `resolveProductIdFromPriceId()`:
1. Matches Stripe price ID against `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID` env vars
2. Queries `products.type = 'membership_monthly'` or `'membership_annual'`
3. Fallback: queries by `stripe_price_id` or `stripe_member_price_id` columns

---

## Environment Variables (Phase 3 Additions)

| Variable | Required | Guard |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Hard fail | Webhook returns 400 without this |
| `STRIPE_MONTHLY_PRICE_ID` | Hard fail | Checkout 500s without this |
| `STRIPE_ANNUAL_PRICE_ID` | Hard fail | Checkout 500s without this |
| `RESEND_API_KEY` | Non-blocking | Email skipped + warning logged if absent |
| `RESEND_FROM_EMAIL` | Optional | Defaults to noreply@omniincubator.org |
| `BEEHIIV_API_KEY` | Non-blocking | Beehiiv calls skipped + warning logged if absent |
| `BEEHIIV_PUBLICATION_ID` | Non-blocking | Beehiiv calls skipped + warning logged if absent |

---

## Running Locally

```bash
# Copy and fill env vars
cp .env.example .env.local

# Start local Stripe webhook forwarding
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Copy the whsec_... value to STRIPE_WEBHOOK_SECRET in .env.local

# Start dev server
npm run dev
```
