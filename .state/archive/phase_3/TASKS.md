# TASKS.md — Phase 3: Billing
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing

All tasks are dependency-ordered. Backend tasks must be completed before Frontend tasks that depend on them. Read SPEC.md in full before starting any task.

---

## [BACKEND]

### B1 — Database Migrations

Create two new SQL migration files. Do not modify any existing migration file.

**File 1:** `supabase/migrations/20240101000015_claim_stripe_event_fn.sql`
```sql
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

**File 2:** `supabase/migrations/20240101000016_increment_download_count_fn.sql`
```sql
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

**Acceptance:** Both files created. `supabase db push` (or local migration run) succeeds without error.

---

### B2 — Confirm Membership Product Row UUIDs

The `product_type` ENUM already includes `'membership_monthly'` and `'membership_annual'` (verified in `20240101000001_enums.sql`). The seed data (`20240101000014_seed_data.sql`) already inserts two membership products.

**Task:** Run `supabase db push` (or check your local DB) and query the `products` table to retrieve the UUIDs of:
- `type = 'membership_monthly'` (slug: `omni-membership-monthly`)
- `type = 'membership_annual'` (slug: `omni-membership-annual`)

Document these UUIDs in `BACKEND_DONE.md`. They are needed for the webhook handler's product_id resolution (see SPEC §5.5 `customer.subscription.created`).

**No new migrations required for this task.**

**Acceptance:** UUIDs documented. Membership products confirmed to exist in DB.

---

### B3 — `src/lib/membership.ts`

Create `src/lib/membership.ts`.

```typescript
// server-only — do not import in client components
import { adminClient } from './supabase/admin'

export async function isActiveMember(userId: string): Promise<boolean> {
  if (!userId) return false
  const { data } = await adminClient
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active'])
    .maybeSingle()
  return !!data
}
```

**Acceptance:** Function exports correctly, TypeScript compiles, returns boolean.

---

### B4 — `src/lib/beehiiv.ts`

Create `src/lib/beehiiv.ts` implementing `subscribeToBeehiiv` and `unsubscribeFromBeehiiv` per SPEC §6. Guards on `BEEHIIV_API_KEY` and `BEEHIIV_PUBLICATION_ID`. All errors caught and logged, never re-thrown.

**Acceptance:** Both functions exported. TypeScript compiles. Functions return `void`, never throw.

---

### B5 — `src/lib/email.tsx`

Create `src/lib/email.tsx` (note: `.tsx` extension, NOT `.ts`). Implements `sendEmail` per SPEC §6.

Template import map covers all 5 templates (ebook_purchase, membership_welcome, membership_charged, trial_ending, payment_failed). After successful send, writes to `email_log` table via `adminClient`. Guard on `RESEND_API_KEY`. All errors caught and logged, never re-thrown.

**Note on JSX imports in email.tsx:** Add `import React from 'react'` if needed by the JSX transform in the project. Check `tsconfig.json` `"jsx"` setting — if `"jsx": "preserve"`, the file will be processed by Next.js Babel/SWC and React import may not be needed. If compilation errors occur related to JSX, add `import React from 'react'` at the top.

**Acceptance:** Module compiles. `sendEmail` exported. All 5 template keys handled.

---

### B6 — `src/lib/stripe.ts` — Add `getOrCreateStripeCustomer`

Open existing `src/lib/stripe.ts`. Append the `getOrCreateStripeCustomer` function per SPEC §6. Do NOT modify, redeclare, or remove any existing code in this file.

```typescript
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  const stripe = getStripe()
  if (!stripe) throw new Error('Stripe not configured')

  const { data: profile } = await adminClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .single()

  if (profile?.stripe_customer_id) return profile.stripe_customer_id

  const customer = await stripe.customers.create({
    email,
    metadata: { supabase_user_id: userId },
  })

  await adminClient
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)

  return customer.id
}
```

**Acceptance:** Function appended. Existing exports intact. TypeScript compiles.

---

### B7 — React Email Templates

Create all 5 email template files in `src/emails/`. Each is a `.tsx` React component.

**Files to create:**
- `src/emails/ebook-purchase.tsx`
- `src/emails/membership-welcome.tsx`
- `src/emails/membership-charged.tsx`
- `src/emails/trial-ending.tsx`
- `src/emails/payment-failed.tsx`

Each uses `@react-email/components` primitives (Html, Head, Body, Container, Text, Button, Hr, Heading, Section, Preview). Props interfaces are typed as defined in SPEC §7. Content per SPEC §7.

Use a consistent visual style: white background, zinc border, centered container max-width 600px, Omni Incubator heading, clear body text.

**Acceptance:** All 5 files created. Each is a valid React component. TypeScript compiles. The `render()` call in `email.tsx` succeeds for each template.

---

### B8 — `POST /api/checkout/membership`

Create `src/app/api/checkout/membership/route.ts`.

Full implementation per SPEC §5.1. Key points:
- `createClient()` → `getUser()` → 401 if no user.
- Validate `plan` field.
- Active subscription pre-check via `adminClient`.
- `getOrCreateStripeCustomer`.
- Read `rewardful_referral` cookie via `request.cookies.get('rewardful_referral')?.value`.
- `stripe.checkout.sessions.create(...)` per spec.
- Resolve `origin` from `request.headers.get('origin') ?? request.headers.get('host') ?? 'https://omniincubator.org'`. Prepend `https://` if no protocol prefix.
- Return `{ url }` on success, `{ error }` on failure.

**Acceptance:** Route created. Returns 401 with no auth, 400 with invalid plan, 400 when already member, 200 with url on success.

---

### B9 — `POST /api/checkout/ebook`

Create `src/app/api/checkout/ebook/route.ts`.

Full implementation per SPEC §5.2. Key points:
- Inline coupon validation (same logic as B11, extracted to a shared helper or duplicated — Backend agent's choice, document in BACKEND_DONE.md).
- Store `is_member_price: String(isMember)` in session metadata.
- Guard: `stripe_price_id` and `stripe_member_price_id` may be null/empty if Phase 2 Stripe sync was not run. Return `400 { error: 'Product not available for purchase' }` if price ID is null.

**Acceptance:** Returns 401 without auth, 404 for unknown ebook, 400 for invalid coupon, 200 with url on success.

---

### B10 — `POST /api/checkout/ebook-with-membership`

Create `src/app/api/checkout/ebook-with-membership/route.ts`.

Full implementation per SPEC §5.3.

**Acceptance:** Returns 401 without auth, 400 if already member, 404 for unknown ebook, 200 with url on success.

---

### B11 — `POST /api/coupons/validate`

Create `src/app/api/coupons/validate/route.ts`.

Full implementation per SPEC §5.4. All 6 validation conditions checked in order. Per-user count via `{ count: 'exact', head: true }`.

**Acceptance:** Returns 401 without auth. Returns `{ valid: true, coupon }` for valid coupon. Returns `{ valid: false, message }` for each invalid condition. Returns 400 on malformed body.

---

### B12 — `POST /api/webhooks/stripe` (Webhook Handler)

Create `src/app/api/webhooks/stripe/route.ts`.

This is the most complex task. Read SPEC §5.5 fully before writing any code.

Required exports at top of file:
```typescript
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
```

Structure:
1. Read raw body with `request.text()`, verify signature.
2. Call `claim_stripe_event` RPC. If no result: return 200.
3. Switch on `event.type`. Handle all 7 event types.
4. All DB writes inside try/catch with compensating delete on error.
5. External HTTP (Beehiiv, Resend) after try block — fire-and-forget with `.catch(console.error)`.

Helper function: `function toISO(unixSeconds: number): string { return new Date(unixSeconds * 1000).toISOString() }`.

The `getStripe()` function is private in `stripe.ts`. The webhook handler needs the Stripe instance. Options:
- Export a `getStripeInstance()` helper from `src/lib/stripe.ts` that returns the lazy singleton (or throws if not configured).
- OR import `Stripe` from `stripe` and construct directly in the webhook using `process.env.STRIPE_SECRET_KEY`.

**Decision:** Add `export function getStripeInstance(): Stripe` to `src/lib/stripe.ts` that calls `getStripe()` and throws if null. This keeps the lazy singleton pattern intact.

**Acceptance:** Route compiles. Returns 400 on invalid sig. Returns 200 immediately for duplicate event. All 7 event types handled without TypeScript errors.

---

### B13 — Add `getStripeInstance` Export to `src/lib/stripe.ts`

Append to `src/lib/stripe.ts`:
```typescript
export function getStripeInstance(): Stripe {
  const s = getStripe()
  if (!s) throw new Error('Stripe not configured — STRIPE_SECRET_KEY missing')
  return s
}
```

**Acceptance:** Exported. TypeScript compiles.

---

### B14 — `GET /api/ebooks/[id]/download`

Create `src/app/api/ebooks/[id]/download/route.ts`.

Full implementation per SPEC §5.10. Uses `adminClient` for ownership check, signed URL generation, and RPC call. Returns 401/403/500/307 per spec.

**Acceptance:** Returns 403 for non-owner. Returns 307 redirect for owner. Increments download count.

---

### B15 — `GET /api/profile/orders`

Create `src/app/api/profile/orders/route.ts`.

Per SPEC §5.6. Auth via `createClient()`. Query via `adminClient`. Paginated, returns `{ orders, hasMore, total }`.

**Acceptance:** Returns 401 without auth. Returns paginated orders with nested order_items.

---

### B16 — `GET /api/profile/ebooks`

Create `src/app/api/profile/ebooks/route.ts`.

Per SPEC §5.7. Auth via `createClient()`. Query via `adminClient`. JS deduplication.

**Acceptance:** Returns 401 without auth. Returns deduplicated ebook list with product metadata.

---

### B17 — `GET /api/profile/subscription`

Create `src/app/api/profile/subscription/route.ts`.

Per SPEC §5.8. Returns `{ subscription: ... | null }`.

**Acceptance:** Returns 401 without auth. Returns null for user with no subscription. Returns subscription data for active/trialing/past_due/canceled.

---

### B18 — `POST /api/subscription/portal`

Create `src/app/api/subscription/portal/route.ts`.

Per SPEC §5.9. Returns 400 if no Stripe customer.

**Acceptance:** Returns 401 without auth. Returns 400 if no stripe_customer_id. Returns 200 with portal URL on success.

---

## [FRONTEND]

Frontend tasks depend on Backend tasks B3–B18 being complete. Read SPEC §8 and §9 before starting.

---

### F1 — Update `src/middleware.ts`

Add `/ebooks/download` route protection per SPEC §9. Insert the new guard block after the `/profile` guard block and before the `/admin` guard block.

**Acceptance:** Unauthenticated user visiting `/ebooks/download/abc` is redirected to `/login?next=/ebooks/download/abc`.

---

### F2 — `src/components/billing/download-button.tsx`

Create the `<DownloadButton>` Client Component per SPEC §8. It is simply an anchor (`<a>`) styled as a button. `href="/api/ebooks/${ebookId}/download"`. The browser follows the 307 redirect from the API to the signed URL automatically.

Props: `{ ebookId: string, label?: string }`.

Use existing shadcn `Button` as the base or replicate its classes with `<a>`.

**Acceptance:** Component renders. Clicking it navigates to the download API URL.

---

### F3 — `src/components/billing/manage-subscription-btn.tsx`

Create the `<ManageSubscriptionBtn>` Client Component. On click: POST to `/api/subscription/portal`, on success `window.location.href = data.url`. Loading state with Lucide `Loader2` spinner. Error display.

**Acceptance:** Component renders. Clicking it calls the portal API and redirects.

---

### F4 — `src/components/billing/checkout-button.tsx`

Create `<CheckoutButton>` Client Component per SPEC §8. Handles both ebook-only and ebook+membership checkout flows based on `withMembership` prop. Loading state, error display, unauthenticated redirect.

**Acceptance:** Component renders. Unauthenticated: renders as link to login. Authenticated: calls correct API on click. Shows loading during fetch. Shows error on failure. Redirects to Stripe on success.

---

### F5 — `src/components/billing/pricing-cards.tsx`

Create `<PricingCards>` Client Component per SPEC §8. Monthly/annual toggle, pricing display, Join Now button, member detection, unauthenticated redirect, error display.

Pricing constants (hardcoded — do NOT fetch from API):
```typescript
const MONTHLY_PRICE_CENTS = 1500  // $15.00
const ANNUAL_PRICE_CENTS = 12900  // $129.00
```

**Acceptance:** Toggle switches between plans. Join Now calls membership checkout API. Error displays inline. Already-a-member state hides button.

---

### F6 — `src/components/billing/order-history.tsx`

Create `<OrderHistory>` Client Component for `/profile/orders`. Props: `{ initialOrders: Order[], total: number }`. Renders order table with expandable line items. Load More fetches next page from `/api/profile/orders`. Uses shadcn `Badge` for status.

**Acceptance:** Table renders. Row expansion shows line items. Load More appends additional orders.

---

### F7 — `/pricing/page.tsx` — Replace Placeholder

Replace `src/app/pricing/page.tsx` placeholder per SPEC §8.

Server Component, `export const dynamic = 'force-dynamic'`. Fetches user and member status. Passes to `<PricingCards>`.

**Acceptance:** Page renders with monthly/annual toggle. Join Now buttons functional. Already-a-member state shown when applicable. `npm run build` passes.

---

### F8 — Modify `src/components/ebook/ebook-detail.tsx`

Replace the disabled Buy placeholder button with `<CheckoutButton>`. Add coupon code input field. Wire coupon validation on blur/debounce. Pass all required props.

The parent page `src/app/library/[slug]/page.tsx` must also be modified to:
1. Import and call `isActiveMember` (guarded: only if `user` exists, else `false`).
2. Pass `ebookId={ebook.id}`, `isMember`, `userId` as additional props to `<EbookDetail>`.

Update `EbookDetailProps` interface to include: `ebookId: string`, `isMember: boolean`, `userId: string | null`.

Coupon input behavior:
- Text input below membership upsell checkbox, placeholder "Enter coupon code (optional)".
- On change: `setCouponCode(value.toUpperCase())`.
- On blur or after 500ms debounce: if `couponCode.length > 0`, call `POST /api/coupons/validate`. Show validation result inline.
- Valid: green text "Coupon applied: {entry_type} bonus".
- Invalid: red text showing message.
- Pass `couponCode` (only if valid) to `<CheckoutButton>`.

**Acceptance:** Buy button functional. Coupon input validates. Page compiles and renders. `npm run build` passes.

---

### F9 — `/ebooks/download/[id]/page.tsx`

Create `src/app/ebooks/download/[id]/page.tsx` per SPEC §8.

Server Component. Auth: `createClient().auth.getUser()`, redirect if no user (middleware also handles this). Fetch ebook + product metadata via `adminClient`. Check ownership via `adminClient`.

Interface pattern:
```typescript
interface DownloadPageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ checkout?: string }>
}
```

Checkout success banner: use shadcn `Alert` component, variant "default" or custom green styling.

**Acceptance:** Page renders with ebook info. Download button present for owners. Success banner shown with `?checkout=success`. Non-owner sees "You do not own this e-book" message.

---

### F10 — `/profile/orders/page.tsx`

Create `src/app/profile/orders/page.tsx`. Server Component. Auth protected by middleware. Server-side initial data fetch. Renders `<OrderHistory>` Client Component.

**Acceptance:** Page renders with order list. Pagination works.

---

### F11 — `/profile/ebooks/page.tsx`

Create `src/app/profile/ebooks/page.tsx`. Server Component. Auth protected by middleware. Server-side ebook query with deduplication. Grid layout.

**Acceptance:** Page renders with owned ebook grid. Download buttons present per ebook.

---

### F12 — `/profile/subscription/page.tsx`

Create `src/app/profile/subscription/page.tsx`. Server Component. Auth protected by middleware. Subscription data fetch. Renders status, plan, dates, and `<ManageSubscriptionBtn>`.

**Acceptance:** Page renders. Status badge shows correct state. Manage Subscription button present. No subscription state handled with prompt to `/pricing`.

---

## [DEVOPS]

### D1 — Environment Variables

Add all 7 new environment variables to `.env.local` (local development) and document them for Vercel deployment. Variables listed in SPEC §10.

Create or update `.env.example` (if present in the repo) with placeholder values for the new variables.

**Acceptance:** All 7 variables documented. Dev environment has test values for Stripe webhook secret and price IDs.

---

### D2 — Stripe Webhook Endpoint (External Task E6)

**This is an EXTERNAL TASK — not automated.** The developer must manually register the webhook endpoint in the Stripe Dashboard:
- Endpoint URL: `https://omniincubator.org/api/webhooks/stripe` (or ngrok URL for local testing)
- Events to subscribe: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `invoice.paid`, `invoice.payment_failed`
- Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET` env var.

Document this in DEPLOY_DONE.md as a required manual step.

---

### D3 — Local Webhook Testing Setup

Document in DEPLOY_DONE.md how to test webhooks locally:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
This requires Stripe CLI installed. The CLI outputs a webhook signing secret for local use.

---

### D4 — Verify TypeScript and Build

Run `npx tsc --noEmit` and `npm run build` after all Backend and Frontend tasks are complete. Resolve any type errors. Document results in DEPLOY_DONE.md.

**Acceptance:** `npx tsc --noEmit` exits with 0 errors. `npm run build` completes successfully.
