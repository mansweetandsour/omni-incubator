# SPEC.md — Phase 4A: Sweepstakes Core
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core

---

## 1. Overview

Phase 4A wires the sweepstakes entry engine into the existing platform. All tables exist from Phase 1 migrations. One new migration is required (Postgres function for REFRESH MATERIALIZED VIEW). This spec covers: the entry calculation engine, webhook wiring, lead capture API and confirmation flow, email templates, admin CRUD pages for sweepstakes/multipliers/coupons, UI components (popup, banner, badges), auth callback lead linking, and Vitest setup.

---

## 2. Stack and Libraries

All runtime packages are already installed. No additional `npm install` is required for runtime.

| Purpose | Package | Status |
|---|---|---|
| Rate limiting | `@upstash/ratelimit` v2.0.8 | installed |
| Redis client | `@upstash/redis` v1.37.0 | installed |
| Email rendering | `@react-email/components` + `resend` | installed |
| Unit testing | `vitest` + `@vitest/coverage-v8` | NOT INSTALLED — add to devDependencies |
| UI | shadcn/ui (Dialog, Badge, Button, etc.) | installed |

**Vitest: add to `package.json` devDependencies:**
```json
"vitest": "^2.0.0",
"@vitest/coverage-v8": "^2.0.0"
```
**Add to `scripts`:**
```json
"test": "vitest run",
"test:watch": "vitest"
```

---

## 3. Environment Variables

No new secrets needed. Phase 4A reads existing env vars:
- `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — DB access
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — rate limiting (optional; skip if absent)
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` — emails
- `NEXT_PUBLIC_SITE_URL` — confirmation email link construction

---

## 4. New Files

```
src/lib/sweepstakes.ts
src/lib/__tests__/sweepstakes.test.ts
vitest.config.ts
src/app/api/lead-capture/route.ts
src/app/api/lead-capture/confirm/route.ts
src/app/api/lead-capture/resend/route.ts
src/app/confirm/[token]/page.tsx
src/components/sweepstakes/LeadCapturePopup.tsx
src/components/sweepstakes/LeadCapturePopupWrapper.tsx
src/components/sweepstakes/EntryBadge.tsx
src/components/sweepstakes/MultiplierBanner.tsx
src/emails/lead-capture-confirm.tsx
src/emails/sample-product-confirm.tsx
src/app/(admin)/admin/sweepstakes/new/page.tsx
src/app/(admin)/admin/sweepstakes/[id]/page.tsx
src/app/(admin)/admin/sweepstakes/[id]/multipliers/page.tsx
src/app/(admin)/admin/coupons/new/page.tsx
src/app/(admin)/admin/coupons/[id]/page.tsx
supabase/migrations/20240101000017_refresh_entry_verification_fn.sql
```

## 5. Modified Files

```
src/app/api/webhooks/stripe/route.ts        (replace 3x TODO Phase 4A stubs)
src/app/api/auth/callback/route.ts          (R8 lead linking with adminClient)
src/app/layout.tsx                          (replace multiplier-banner-slot div + add popup wrapper)
src/lib/email.tsx                           (add 2 new template keys)
src/app/library/page.tsx                    (fetch sweepData once, pass to ProductCard)
src/components/library/product-card.tsx     (add sweepData + custom_entry_amount props)
src/app/library/[slug]/page.tsx             (add EntryBadge + informational note)
src/app/(admin)/admin/sweepstakes/page.tsx  (replace placeholder with full list page)
src/app/(admin)/admin/coupons/page.tsx      (replace placeholder with full list page)
src/app/(admin)/admin/products/page.tsx     (add no-active-sweepstake warning banner)
package.json                                (add vitest devDependencies + scripts)
```

---

## 6. Data Models (read-only reference — all tables exist in migrations)

### sweepstakes
```
id uuid PK | title text NOT NULL | description text | prize_amount_cents int
prize_description text | start_at timestamptz | end_at timestamptz
status text DEFAULT 'draft' — valid: draft|active|ended|drawn
non_purchase_entry_amount int DEFAULT 1 | official_rules_url text
winner_user_id uuid FK profiles | winner_drawn_at timestamptz
```
DB constraint: `idx_sweepstakes_single_active` partial unique index — `WHERE status = 'active'`. Only one active sweepstake allowed.

### entry_multipliers
```
id uuid PK | sweepstake_id uuid FK sweepstakes ON DELETE CASCADE
name text NOT NULL | description text | multiplier NUMERIC(5,2) CHECK > 0
start_at timestamptz | end_at timestamptz | is_active boolean DEFAULT true
```
Constraint: `end_at > start_at`

### coupons
```
id uuid PK | code text UNIQUE NOT NULL | name text
entry_type coupon_entry_type ENUM (multiplier|fixed_bonus)
entry_value NUMERIC(10,2) | max_uses_global int (nullable = unlimited)
max_uses_per_user int DEFAULT 1 | current_uses int DEFAULT 0
expires_at timestamptz (nullable) | sweepstake_id uuid FK (nullable)
is_active boolean DEFAULT true
```

### sweepstake_entries
```
id uuid PK | sweepstake_id uuid FK | user_id uuid FK (nullable)
lead_capture_id uuid (nullable FK, deferred) | source entry_source ENUM
order_id uuid FK (nullable) | order_item_id uuid FK (nullable) | product_id uuid FK (nullable)
base_entries int | multiplier NUMERIC(5,2) DEFAULT 1.0
coupon_multiplier NUMERIC(5,2) DEFAULT 1.0 | coupon_id uuid FK (nullable)
bonus_entries int DEFAULT 0 | total_entries int | list_price_cents int DEFAULT 0
amount_cents int DEFAULT 0
```
UNIQUE: `(order_item_id, sweepstake_id)` — Postgres NULLs are never equal, so NULL order_item_id does not prevent duplicate entries for lead captures.

### lead_captures
```
id uuid PK | email text | phone text | ip_address inet | user_id uuid FK (nullable)
source text DEFAULT 'popup' | sample_product_id uuid (nullable)
sweepstake_id uuid FK (nullable) | confirmation_token text UNIQUE
confirmation_sent_at timestamptz | confirmed_at timestamptz (null = unconfirmed)
entry_awarded boolean DEFAULT false
```
UNIQUE: `(email, sweepstake_id)` — NULL sweepstake_id allows multiple rows per email (Postgres NULLs are never equal in UNIQUE indexes).

### orders (relevant Phase 3 columns)
- `entries_awarded_by_checkout boolean DEFAULT false`
- `is_subscription_renewal boolean DEFAULT false`

---

## 7. New Migration

**File:** `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql`

```sql
CREATE OR REPLACE FUNCTION public.refresh_entry_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification;
END;
$$;
```

This is the only schema-touching change in Phase 4A. Required because `adminClient.rpc('refresh_entry_verification')` cannot execute `REFRESH MATERIALIZED VIEW` without a Postgres wrapper function.

---

## 8. Entry Engine — `src/lib/sweepstakes.ts`

### 8.1 `calculateEntries()` — Pure function (no DB calls)

```typescript
// All types in this file

export interface CalculateEntriesParams {
  product: {
    price_cents: number
    member_price_cents: number | null
    custom_entry_amount: number | null
  }
  listPriceCents: number
  pricePaidCents: number
  sweepstakeId: string
  couponId?: string | null
  activeMultiplierMax?: number | null   // pre-fetched by caller
  coupon?: {
    entry_type: 'multiplier' | 'fixed_bonus'
    entry_value: number
  } | null                              // pre-fetched by caller
}

export interface CalculateEntriesResult {
  baseEntries: number
  multiplier: number
  couponMultiplier: number
  bonusEntries: number
  totalEntries: number
  listPriceCents: number
  amountCents: number
}
```

**Calculation logic:**
```
baseEntries      = product.custom_entry_amount ?? Math.floor(listPriceCents / 100)
globalMultiplier = activeMultiplierMax ?? 1.0
couponMultiplier = coupon?.entry_type === 'multiplier' ? coupon.entry_value : 1.0
bonusEntries     = coupon?.entry_type === 'fixed_bonus' ? coupon.entry_value : 0
totalEntries     = Math.floor(baseEntries * globalMultiplier * couponMultiplier) + bonusEntries
```

Returns `CalculateEntriesResult` with `multiplier = globalMultiplier`, `amountCents = pricePaidCents`.

### 8.2 `computeLeadCaptureEntries()` — Pure helper (exported for tests)

```typescript
export function computeLeadCaptureEntries(
  nonPurchaseEntryAmount: number,
  sampleCustomAmount?: number | null
): number {
  return sampleCustomAmount ?? nonPurchaseEntryAmount
}
```

Used internally by `awardLeadCaptureEntries`. Exported so unit tests can verify logic without DB mocking.

### 8.3 `awardPurchaseEntries()` — Async, DB writes

```typescript
export interface AwardPurchaseEntriesParams {
  orderId: string
  orderItemId: string | null
  productId: string
  userId: string
  sweepstakeId: string
  listPriceCents: number
  pricePaidCents: number
  couponId?: string | null
}

export async function awardPurchaseEntries(params: AwardPurchaseEntriesParams): Promise<{ totalEntries: number }>
```

**Steps (all use `adminClient`):**
1. Fetch product: `products WHERE id = productId` → `{ price_cents, member_price_cents, custom_entry_amount }`
2. Fetch active multiplier MAX: `SELECT MAX(multiplier) FROM entry_multipliers WHERE sweepstake_id = sweepstakeId AND is_active = true AND start_at <= NOW() AND end_at >= NOW()`. Parse as `number | null`.
3. If `couponId`: fetch coupon `coupons WHERE id = couponId AND is_active = true` → `{ entry_type, entry_value } | null`
4. Call `calculateEntries({ product, listPriceCents, pricePaidCents, sweepstakeId, couponId, activeMultiplierMax, coupon })`
5. Insert `sweepstake_entries`:
   ```
   { sweepstake_id: sweepstakeId, user_id: userId, source: 'purchase',
     order_id: orderId, order_item_id: orderItemId, product_id: productId,
     base_entries: result.baseEntries, multiplier: result.multiplier,
     coupon_multiplier: result.couponMultiplier, coupon_id: couponId ?? null,
     bonus_entries: result.bonusEntries, total_entries: result.totalEntries,
     list_price_cents: listPriceCents, amount_cents: pricePaidCents }
   ```
6. Call `refreshEntryVerification()` — fire-and-forget (do not await, do not catch propagation)
7. Return `{ totalEntries: result.totalEntries }`

Errors propagate to the caller (webhook try/catch).

### 8.4 `awardLeadCaptureEntries()` — Async, DB writes

```typescript
export interface AwardLeadCaptureEntriesParams {
  leadCaptureId: string
  userId?: string | null
  sweepstakeId: string
  sampleProductId?: string | null
}

export async function awardLeadCaptureEntries(params: AwardLeadCaptureEntriesParams): Promise<{ totalEntries: number }>
```

**Steps:**
1. Fetch sweepstake: `sweepstakes WHERE id = sweepstakeId` → `{ non_purchase_entry_amount }`
2. If `sampleProductId`: fetch `sample_products WHERE id = sampleProductId` → `{ custom_entry_amount }`
3. `baseEntries = computeLeadCaptureEntries(sweepstake.non_purchase_entry_amount, sampleProduct?.custom_entry_amount)`
4. Insert `sweepstake_entries`:
   ```
   { sweepstake_id: sweepstakeId, user_id: userId ?? null,
     lead_capture_id: leadCaptureId, source: 'non_purchase_capture',
     base_entries: baseEntries, multiplier: 1.0, coupon_multiplier: 1.0,
     coupon_id: null, bonus_entries: 0, total_entries: baseEntries,
     list_price_cents: 0, amount_cents: 0 }
   ```
5. Return `{ totalEntries: baseEntries }`

### 8.5 `refreshEntryVerification()` — Module-level debounced

```typescript
let _lastRefreshAt: number | null = null
const DEBOUNCE_MS = 60_000

export async function refreshEntryVerification(): Promise<void> {
  const now = Date.now()
  if (_lastRefreshAt !== null && (now - _lastRefreshAt) < DEBOUNCE_MS) {
    return  // debounced — skip
  }
  _lastRefreshAt = now
  try {
    await adminClient.rpc('refresh_entry_verification')
  } catch (err) {
    console.error('[sweepstakes] refreshEntryVerification failed', err)
    // Non-blocking — do not rethrow
  }
}
```

### 8.6 `getActiveSweepstake()` — Exported helper

```typescript
export async function getActiveSweepstake(): Promise<{
  id: string
  non_purchase_entry_amount: number
  prize_amount_cents: number | null
  title: string
  prize_description: string | null
} | null>
```

Queries `sweepstakes WHERE status = 'active' LIMIT 1` using `adminClient`. Returns `null` if none found.

---

## 9. Webhook Handler Changes — `src/app/api/webhooks/stripe/route.ts`

Import at top: `import { awardPurchaseEntries } from '@/lib/sweepstakes'`

### 9.1 Fix: `order_items` insert in payment mode (line 177)

Change:
```typescript
await adminClient.from('order_items').insert({...})
```
To:
```typescript
const { data: orderItemRow, error: orderItemError } = await adminClient
  .from('order_items')
  .insert({ order_id: newOrderId, product_id: ebook.product_id, product_type: 'ebook',
    product_title: product.title, quantity: 1, unit_price_cents: session.amount_total,
    list_price_cents: product.price_cents })
  .select('id')
  .single()
if (orderItemError || !orderItemRow) throw new Error(orderItemError?.message ?? 'Failed to insert order_item')
```

### 9.2 Replace Stub 1: payment mode entry awarding (after user_ebooks insert, before try-block end)

Replace `// TODO Phase 4A: award sweepstake entries (ebook purchase)` with:

```typescript
// Award sweepstake entries (ebook purchase)
const { data: activeSweepstake } = await adminClient
  .from('sweepstakes').select('id').eq('status', 'active').maybeSingle()
if (activeSweepstake) {
  await awardPurchaseEntries({
    orderId: newOrderId,
    orderItemId: orderItemRow.id,
    productId: ebook.product_id,
    userId: userId,
    sweepstakeId: activeSweepstake.id,
    listPriceCents: product.price_cents,
    pricePaidCents: session.amount_total ?? 0,
    couponId: session.metadata?.coupon_id ?? null,
  })
}
```

### 9.3 Fix: `order_items` insert in subscription/combined mode (line 246)

Same pattern as 9.1 — add `.select('id').single()`, capture as `ebookOrderItemRow`.

### 9.4 Replace Stub 2: subscription/combined mode entry awarding (after subscription upsert, before try-block end)

Replace `// TODO Phase 4A: award sweepstake entries (combined checkout — entries_awarded_by_checkout=true)` with:

```typescript
// Award sweepstake entries (combined checkout — ebook item only)
if (ebookId && ebook) {
  const { data: activeSweepstake2 } = await adminClient
    .from('sweepstakes').select('id').eq('status', 'active').maybeSingle()
  if (activeSweepstake2) {
    const ebookProduct2 = (ebook.products as unknown) as { id: string; title: string; price_cents: number }
    await awardPurchaseEntries({
      orderId: newOrderId,
      orderItemId: ebookOrderItemRow?.id ?? null,
      productId: ebook.product_id,
      userId: userId,
      sweepstakeId: activeSweepstake2.id,
      listPriceCents: ebookProduct2.price_cents,
      pricePaidCents: session.amount_total ?? 0,
      couponId: null,
    })
  }
}
```

### 9.5 Fix: `orders` insert in `invoice.paid` (line 486)

Change:
```typescript
await adminClient.from('orders').insert({ ... })
```
To:
```typescript
const { data: renewalOrder, error: renewalOrderError } = await adminClient
  .from('orders')
  .insert({ user_id: sub.user_id, stripe_invoice_id: invoice.id, status: 'completed',
    subtotal_cents: invoice.subtotal, discount_cents: 0, total_cents: invoice.amount_paid,
    is_subscription_renewal: true, entries_awarded_by_checkout: false })
  .select('id')
  .single()
if (renewalOrderError || !renewalOrder) throw new Error(renewalOrderError?.message ?? 'Failed to insert renewal order')
const renewalOrderId = renewalOrder.id
```

### 9.6 Replace Stub 3: `invoice.paid` entry awarding (after orders insert, before try-block end)

Replace `// TODO Phase 4A: award sweepstake entries (renewal...)` with:

```typescript
// Award sweepstake entries (renewal) — dedup check first
const { data: checkoutOrder } = await adminClient
  .from('orders')
  .select('id')
  .eq('user_id', sub.user_id)
  .eq('entries_awarded_by_checkout', true)
  .eq('is_subscription_renewal', false)
  .order('created_at', { ascending: true })
  .limit(1)
  .maybeSingle()

if (!checkoutOrder) {
  const { data: activeSweepstake3 } = await adminClient
    .from('sweepstakes').select('id').eq('status', 'active').maybeSingle()
  if (activeSweepstake3) {
    const { data: subWithProduct } = await adminClient
      .from('subscriptions')
      .select('product_id, products!inner(id, price_cents, type, title)')
      .eq('stripe_subscription_id', subscriptionId)
      .single()
    if (subWithProduct) {
      const subProduct = (subWithProduct.products as unknown) as { id: string; price_cents: number; type: string; title: string }
      const { data: renewalItem } = await adminClient
        .from('order_items')
        .insert({ order_id: renewalOrderId, product_id: subWithProduct.product_id,
          product_type: subProduct.type as 'membership_monthly' | 'membership_annual',
          product_title: subProduct.title, quantity: 1,
          unit_price_cents: invoice.amount_paid,
          list_price_cents: subProduct.price_cents })
        .select('id')
        .single()
      if (renewalItem) {
        await awardPurchaseEntries({
          orderId: renewalOrderId,
          orderItemId: renewalItem.id,
          productId: subWithProduct.product_id,
          userId: sub.user_id,
          sweepstakeId: activeSweepstake3.id,
          listPriceCents: subProduct.price_cents,
          pricePaidCents: invoice.amount_paid,
          couponId: null,
        })
      }
    }
  }
}
```

---

## 10. Lead Capture APIs

### 10.1 Rate Limiting Pattern

Both lead capture and resend routes use this inline pattern:

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

function makeRateLimiter(requests: number, window: `${number} ${'ms'|'s'|'m'|'h'|'d'}`) {
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
```

If `makeRateLimiter` returns `null`, skip rate limit check entirely.

IP from request: `request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown'`

Both routes: `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'`.

### 10.2 `POST /api/lead-capture` — `src/app/api/lead-capture/route.ts`

1. Rate limit: `makeRateLimiter(5, '1 h')`. Key: `lead_capture:{ip}`. On fail: `429 { error: 'Too many requests' }`.
2. Parse + validate body. Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. On fail: `400 { error: 'Invalid email' }`.
3. Resolve sweepstake: `sweepstakeId` from body OR query `sweepstakes WHERE status = 'active' LIMIT 1`. If none: insert lead_capture with `sweepstake_id = null`, skip email, return `200 { success: true, noActiveSweepstake: true }`.
4. Duplicate check: `lead_captures WHERE email = $email AND sweepstake_id = $resolvedId`. If found: `200 { duplicate: true, message: "You've already entered" }`.
5. Insert `lead_captures` using `adminClient`:
   ```
   { email, phone: phone ?? null, source, sweepstake_id: resolvedId,
     sample_product_id: sampleProductId ?? null, ip_address: clientIp,
     confirmation_token: crypto.randomUUID(), confirmation_sent_at: new Date().toISOString(),
     confirmed_at: null, entry_awarded: false }
   ```
   Capture returned row (`.select().single()`).
6. Construct `confirmUrl = ${NEXT_PUBLIC_SITE_URL ?? 'https://omniincubator.org'}/confirm/${insertedRow.confirmation_token}`.
7. Send email: template = `source === 'sample_product' ? 'sample_product_confirm' : 'lead_capture_confirm'`. Data: `{ confirmUrl, sweepstakeTitle: sweepstake.title, prizeDescription: sweepstake.prize_description }` (or `{ confirmUrl, productTitle: ... }` for sample). Wrap in try/catch — do not throw on failure.
8. Return `200 { success: true }`.

### 10.3 `POST /api/lead-capture/confirm` — `src/app/api/lead-capture/confirm/route.ts`

1. Parse body: `{ token: string }`. If missing: `400`.
2. Query: `lead_captures WHERE confirmation_token = $token` (use `adminClient`). If not found: `404 { error: 'Invalid or expired token' }`.
3. If `confirmed_at IS NOT NULL`: query `sweepstake_entries WHERE lead_capture_id = $id` for `total_entries`. Return `200 { alreadyConfirmed: true, entries: sum(total_entries), source }`.
4. Check expiry: `new Date(lead.confirmation_sent_at).getTime() < Date.now() - 72 * 3600 * 1000`. If expired: `410 { error: 'Token expired', email: lead.email }`.
5. Update: `confirmed_at = new Date().toISOString(), entry_awarded = true`.
6. Call `awardLeadCaptureEntries({ leadCaptureId: lead.id, userId: lead.user_id, sweepstakeId: lead.sweepstake_id, sampleProductId: lead.sample_product_id })`. Capture `{ totalEntries }`.
7. Query active multiplier for success state: `entry_multipliers WHERE sweepstake_id = lead.sweepstake_id AND is_active = true AND start_at <= NOW() AND end_at >= NOW() ORDER BY multiplier DESC LIMIT 1`. Include as `activeMultiplier: number | null` in response.
8. Redirect / success:
   - If `source === 'sample_product'`: query `sample_products WHERE id = lead.sample_product_id` for `slug`. Return `200 { redirect: '/free/{slug}/download?token={token}' }`.
   - Else: query `sweepstakes WHERE id = lead.sweepstake_id` for `{ title, prize_description }`. Return `200 { success: true, entries: totalEntries, source, sweepstake: { title, prize_description }, activeMultiplier }`.

### 10.4 `POST /api/lead-capture/resend` — `src/app/api/lead-capture/resend/route.ts`

1. Parse body: `{ email: string }`. If missing: `400`.
2. Rate limit: `makeRateLimiter(1, '5 m')`. Key: `resend_confirm:{email}`. On fail: `429 { error: 'Too soon' }`.
3. Query: `lead_captures WHERE email = $email AND confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1`. If not found: `200` silently (no enumeration).
4. DB-level "too soon" guard (covers case where Upstash is absent): if `confirmation_sent_at > NOW() - 5min`, return `429 { error: 'Too soon' }`.
5. Expiry check: if `confirmation_sent_at < NOW() - 72h`, return `410 { error: 'Expired', message: 'This link has expired. Please re-submit your email.' }`.
6. Update: `confirmation_token = crypto.randomUUID(), confirmation_sent_at = new Date().toISOString()`.
7. Resend email with new `confirmUrl`.
8. Return `200 { success: true }`.

---

## 11. Email Templates

### 11.1 `src/emails/lead-capture-confirm.tsx`

```typescript
export interface LeadCaptureConfirmEmailProps {
  confirmUrl: string
  sweepstakeTitle: string
  prizeDescription: string | null
}
```

Content: "Confirm your entry in the {sweepstakeTitle} sweepstake!" with a "Confirm My Entry" CTA button. Matches existing template styling (Container, Hr, Button components from `@react-email/components`).

### 11.2 `src/emails/sample-product-confirm.tsx`

```typescript
export interface SampleProductConfirmEmailProps {
  confirmUrl: string
  productTitle: string
}
```

Content: "Confirm your email to get your free copy of {productTitle}" with a "Confirm & Download" button.

### 11.3 `src/lib/email.tsx` — Add two template keys

Add to `TemplateKey` union:
```typescript
| 'lead_capture_confirm'
| 'sample_product_confirm'
```

Add to `SUBJECTS`:
```typescript
lead_capture_confirm: 'Confirm your sweepstakes entry',
sample_product_confirm: 'Confirm your email to get your free download',
```

Add two cases to the switch statement. The `data` type cast pattern from existing cases applies.

---

## 12. Auth Callback — `src/app/api/auth/callback/route.ts`

**Changes:**
1. Add import: `import { adminClient } from '@/lib/supabase/admin'`
2. Replace the `if (!error) { ... }` block:

```typescript
if (!error) {
  // R8: Link sweepstake_entries for pre-signup lead confirms (fire-and-forget)
  const { data: { user: newUser } } = await supabase.auth.getUser()
  if (newUser?.id) {
    adminClient
      .from('sweepstake_entries')
      .update({ user_id: newUser.id })
      .is('user_id', null)
      .filter(
        'lead_capture_id',
        'in',
        `(SELECT id FROM lead_captures WHERE user_id = '${newUser.id}')`
      )
      .then(() => {})
      .catch((err: unknown) => console.error('[auth/callback] lead linking failed', err))
  }
  const redirectTo = next.startsWith('/') ? next : '/library'
  return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
}
```

The `adminClient` is used because RLS on `sweepstake_entries` prevents session-scoped anon clients from performing this UPDATE. The entire operation is fire-and-forget — it must not block the redirect.

---

## 13. Root Layout — `src/app/layout.tsx`

**Change at line 44:** Replace `<div id="multiplier-banner-slot" />` with:
```tsx
<Suspense fallback={null}>
  <MultiplierBanner />
</Suspense>
<Suspense fallback={null}>
  <LeadCapturePopupWrapper />
</Suspense>
```

Add imports:
```tsx
import { Suspense } from 'react'
import MultiplierBanner from '@/components/sweepstakes/MultiplierBanner'
import { LeadCapturePopupWrapper } from '@/components/sweepstakes/LeadCapturePopupWrapper'
```

---

## 14. Frontend Components

### 14.1 `MultiplierBanner.tsx` — `src/components/sweepstakes/MultiplierBanner.tsx`

Split server (data) + client (dismiss state) in one file:

```typescript
// Default export — server component (async RSC)
import { unstable_cache } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'

const getActiveMultiplier = unstable_cache(
  async () => {
    const { data } = await adminClient
      .from('entry_multipliers')
      .select('id, name, multiplier, end_at, sweepstakes!inner(status)')
      .eq('is_active', true)
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())
      .eq('sweepstakes.status', 'active')
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  },
  ['active-multiplier'],
  { revalidate: 60, tags: ['active-multiplier'] }
)

export default async function MultiplierBanner() {
  const data = await getActiveMultiplier()
  if (!data) return null
  return <MultiplierBannerClient name={data.name} multiplier={Number(data.multiplier)} endAt={data.end_at} />
}
```

```typescript
// Client sub-component — same file
'use client'
function MultiplierBannerClient({ name, multiplier, endAt }: {
  name: string; multiplier: number; endAt: string
}) {
  const [show, setShow] = useState(true)
  if (!show) return null
  const formattedEnd = new Date(endAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <div className="w-full bg-amber-400 text-amber-950 text-sm py-2 px-4 flex items-center justify-between">
      <span>{name} — {multiplier}X entries on all purchases! Ends {formattedEnd}</span>
      <button onClick={() => setShow(false)} aria-label="Dismiss banner" className="ml-4 font-bold">✕</button>
    </div>
  )
}
```

Note: `useState` is from `react` (import at file top with `'use client'` annotation on `MultiplierBannerClient` or in a separate file). Since the server component and client component cannot share a `'use client'` directive in the same file, `MultiplierBannerClient` must be in a separate file:

**Actual file split:**
- `src/components/sweepstakes/MultiplierBanner.tsx` — server component (default export), no `'use client'`
- `src/components/sweepstakes/MultiplierBannerClient.tsx` — `'use client'` client component, imported by MultiplierBanner.tsx

### 14.2 `EntryBadge.tsx` — `src/components/sweepstakes/EntryBadge.tsx`

Server component (async RSC). No `'use client'`.

```typescript
import { unstable_cache } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'

const getActiveSweepstakeData = unstable_cache(
  async () => {
    const { data: sw } = await adminClient
      .from('sweepstakes')
      .select('id')
      .eq('status', 'active')
      .maybeSingle()
    if (!sw) return null
    const { data: mult } = await adminClient
      .from('entry_multipliers')
      .select('multiplier')
      .eq('sweepstake_id', sw.id)
      .eq('is_active', true)
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { sweepstakeId: sw.id, activeMultiplier: mult ? Number(mult.multiplier) : null }
  },
  ['active-sweepstake'],
  { revalidate: 60, tags: ['active-sweepstake'] }
)

interface EntryBadgeProps {
  product: { price_cents: number; custom_entry_amount: number | null }
  className?: string
}

export async function EntryBadge({ product, className }: EntryBadgeProps) {
  const data = await getActiveSweepstakeData()
  if (!data) return null
  const base = product.custom_entry_amount ?? Math.floor(product.price_cents / 100)
  if (data.activeMultiplier) {
    const earned = Math.floor(base * data.activeMultiplier)
    return <span className={`text-xs font-semibold text-orange-600 ${className ?? ''}`}>🔥 {data.activeMultiplier}X ENTRIES — Earn {earned} entries</span>
  }
  return <span className={`text-xs font-medium text-zinc-500 ${className ?? ''}`}>🎟️ Earn {base} entries</span>
}
```

### 14.3 `LeadCapturePopup.tsx` — `src/components/sweepstakes/LeadCapturePopup.tsx`

`'use client'`. Two exports: `LeadCapturePopup` (modal wrapper) and `LeadCaptureForm` (form only).

**Props:**
```typescript
interface LeadCapturePopupProps {
  prizeAmount: string   // e.g. "$5,000" — formatted by server wrapper
}
interface LeadCaptureFormProps {
  prizeAmount: string
  source?: 'popup' | 'footer' | 'marketplace_coming_soon'
  onSuccess?: () => void
}
```

**Popup trigger logic (inside `LeadCapturePopup`):**
```typescript
useEffect(() => {
  // Check suppression
  if (localStorage.getItem('omni_popup_submitted')) return
  const dismissed = localStorage.getItem('omni_popup_dismissed')
  if (dismissed) {
    const age = Date.now() - new Date(dismissed).getTime()
    if (age < 30 * 24 * 3600 * 1000) return  // re-show after 30 days
  }

  let triggered = false
  const open = () => { if (!triggered) { triggered = true; setOpen(true) } }

  const timer = setTimeout(open, 10_000)
  const onScroll = () => {
    if (window.scrollY >= document.body.scrollHeight * 0.5) open()
  }
  window.addEventListener('scroll', onScroll, { passive: true })
  return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll) }
}, [])
```

**On dismiss** (`onOpenChange(false)`): `localStorage.setItem('omni_popup_dismissed', new Date().toISOString())`
**On submit success**: `localStorage.setItem('omni_popup_submitted', '1')`

**UI structure:** shadcn `Dialog` > `DialogContent` > `DialogHeader` with `DialogTitle`. The form content switches to success state after successful submit without closing the dialog.

**Form states:** idle → loading (button disabled, spinner) → success (show "📧 Check your email..." + resend button) → error (inline error).

**`LeadCaptureForm`** is the same form without Dialog wrapper. It manages its own `email`, `phone`, `state` state. Accepts `source` prop (default `'popup'`).

### 14.4 `LeadCapturePopupWrapper.tsx` — `src/components/sweepstakes/LeadCapturePopupWrapper.tsx`

Async server component (no `'use client'`).

```typescript
import { adminClient } from '@/lib/supabase/admin'
import { LeadCapturePopup } from './LeadCapturePopup'

export async function LeadCapturePopupWrapper() {
  const { data: sw } = await adminClient
    .from('sweepstakes')
    .select('prize_amount_cents')
    .eq('status', 'active')
    .maybeSingle()
  if (!sw) return null
  const prizeAmount = sw.prize_amount_cents
    ? `$${(sw.prize_amount_cents / 100).toLocaleString('en-US')}`
    : 'an amazing prize'
  return <LeadCapturePopup prizeAmount={prizeAmount} />
}
```

### 14.5 `/confirm/[token]` page — `src/app/confirm/[token]/page.tsx`

`'use client'`. Uses `useParams()`.

```typescript
type ConfirmState =
  | { status: 'loading' }
  | { status: 'success'; entries: number; sweepstakeTitle: string; prizeDescription: string | null; activeMultiplier: number | null }
  | { status: 'already_confirmed'; entries: number }
  | { status: 'invalid' }
  | { status: 'expired'; email: string }
```

**On mount (useEffect):** POST to `/api/lead-capture/confirm` with `{ token }`. Map response to state.
- `200 { success: true }` → `success`
- `200 { alreadyConfirmed: true }` → `already_confirmed`
- `200 { redirect }` → `router.replace(data.redirect)`
- `404` → `invalid`
- `410` → `expired` (include email from response body)

**Loading:** skeleton or spinner centered on page.
**Success:** "✅ You're in! You earned {entries} entries in the {sweepstakeTitle} sweepstake." + CTA buttons (Browse Library: `/library`, Join Membership: `/pricing`). If `activeMultiplier > 1`: amber callout "{M}X entry bonus active on all purchases!".
**Already confirmed:** "You've already confirmed! You have {entries} entries." + same CTAs.
**Invalid:** "This link is invalid. Submit your email again." + `<Link href="/">Go to homepage</Link>`.
**Expired:** "This link has expired (72 hours). Enter your email again to get a new one." + `<LeadCaptureForm source="popup" />`.

---

## 15. Library Page Changes

### 15.1 `src/app/library/page.tsx`

Add at the top of the server component function, after existing data fetches:

```typescript
// Fetch sweepstake data once for entry badges
const { data: activeSw } = await createClient()  // use server client (reads anon)
  // Actually use adminClient to avoid auth complexity:
  // Better: use a simple server-side fetch with adminClient
```

**Decision:** Use `adminClient` (already imported in admin pages; import it in library page too) for consistency. The library page is a server component with `export const revalidate = 60`, so this query adds negligible overhead.

```typescript
import { adminClient } from '@/lib/supabase/admin'

// Inside LibraryPage:
const [{ data: activeSweepstake }, { data: activeMultiplierRow }] = await Promise.all([
  adminClient.from('sweepstakes').select('id').eq('status', 'active').maybeSingle(),
  adminClient.from('entry_multipliers')
    .select('multiplier')
    .eq('is_active', true)
    .lte('start_at', new Date().toISOString())
    .gte('end_at', new Date().toISOString())
    .order('multiplier', { ascending: false })
    .limit(1)
    .maybeSingle(),
])

const sweepData = activeSweepstake
  ? { hasActiveSweepstake: true, activeMultiplier: activeMultiplierRow ? Number(activeMultiplierRow.multiplier) : null }
  : null
```

Pass `sweepData` to each `ProductCard`:
```tsx
<ProductCard key={product.id} product={{ ...product, custom_entry_amount: null }} sweepData={sweepData} />
```

Note: `productCards` already excludes `custom_entry_amount` from the select. The Backend agent must add `custom_entry_amount` to the products query SELECT list: update the Supabase query to include `custom_entry_amount` in the select string.

### 15.2 `src/components/library/product-card.tsx`

Add optional props:
```typescript
interface ProductCardProps {
  product: {
    // existing fields...
    custom_entry_amount?: number | null  // new
  }
  sweepData?: {
    hasActiveSweepstake: boolean
    activeMultiplier: number | null
  } | null                              // new
}
```

Replace static `<span className="text-xs text-zinc-400 italic">Earn entries</span>` with:
```tsx
{sweepData?.hasActiveSweepstake && (() => {
  const base = product.custom_entry_amount ?? Math.floor(product.price_cents / 100)
  if (sweepData.activeMultiplier) {
    const earned = Math.floor(base * sweepData.activeMultiplier)
    return <span className="text-xs font-semibold text-orange-600">🔥 {sweepData.activeMultiplier}X — {earned} entries</span>
  }
  return <span className="text-xs font-medium text-zinc-500">🎟️ {base} entries</span>
})()}
```

### 15.3 `src/app/library/[slug]/page.tsx`

Add below the `if (!product) notFound()` check and before `EbookDetail`:
```tsx
import { Suspense } from 'react'
import { EntryBadge } from '@/components/sweepstakes/EntryBadge'

// In the JSX return, add above EbookDetail:
<Suspense fallback={null}>
  <EntryBadge product={{ price_cents: product.price_cents, custom_entry_amount: product.custom_entry_amount ?? null }} />
</Suspense>
<p className="text-sm text-zinc-500 mt-1">
  Members earn {Math.floor(product.price_cents / 100)} entries (based on full ${(product.price_cents / 100).toFixed(2)} price)
</p>
```

The product query already uses `select('*, ebooks!inner(*)')` which fetches all product columns including `custom_entry_amount`.

---

## 16. Admin Pages

### 16.1 `/admin/sweepstakes` — `src/app/(admin)/admin/sweepstakes/page.tsx`

Replace placeholder. Server component pattern matching existing `/admin/products/page.tsx`.

Fetch: `adminClient.from('sweepstakes').select('*').order('created_at', { ascending: false })`

Render table. Activate/End buttons are in a `SweepstakeActions` client component that:
- Calls `PUT /api/admin/sweepstakes` (or a Server Action) with `{ id, action: 'activate' | 'end' }`
- On activate: if response status 409 (conflict), show toast "Another sweepstake is already active"
- On success: `router.refresh()`

**Server Action pattern for activate/end** (preferred over new API route): use `'use server'` action in a separate `src/app/(admin)/admin/sweepstakes/actions.ts` file.

```typescript
// actions.ts
'use server'
import { adminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'

export async function activateSweepstake(id: string): Promise<{ error?: string }> {
  // Pre-check
  const { data: existing } = await adminClient
    .from('sweepstakes').select('id, title').eq('status', 'active').neq('id', id).maybeSingle()
  if (existing) return { error: `Another sweepstake is already active: "${existing.title}"` }
  const { error } = await adminClient.from('sweepstakes').update({ status: 'active' }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTag('active-sweepstake')
  revalidateTag('active-multiplier')
  return {}
}

export async function endSweepstake(id: string): Promise<{ error?: string }> {
  const { error } = await adminClient.from('sweepstakes').update({ status: 'ended' }).eq('id', id)
  if (error) return { error: error.message }
  revalidateTag('active-sweepstake')
  revalidateTag('active-multiplier')
  return {}
}
```

### 16.2 Sweepstake Create/Edit Forms

`/admin/sweepstakes/new/page.tsx` and `/admin/sweepstakes/[id]/page.tsx` — both use the same form component `SweepstakeForm` (client component) rendered on server pages.

Form fields: title (required), description, prize_amount_cents (input type=number min=0 step=1 displayed as dollars with `/ 100` conversion, stored as integer cents), prize_description, start_at (datetime-local), end_at (datetime-local), non_purchase_entry_amount (integer, default 1), official_rules_url.

Server Actions:
```typescript
// createSweepstake(formData): inserts row, redirect('/admin/sweepstakes')
// updateSweepstake(id, formData): updates row, redirect('/admin/sweepstakes')
```

### 16.3 `/admin/sweepstakes/[id]/multipliers` — `src/app/(admin)/admin/sweepstakes/[id]/multipliers/page.tsx`

Server page. Loads `sweepstake` header + all `entry_multipliers WHERE sweepstake_id = id ORDER BY created_at DESC`.

Client `MultiplierForm` component. Server Actions:
```typescript
// upsertMultiplier(sweepstakeId, data): insert or update. Returns { warning?: string }
// toggleMultiplier(id, is_active): update is_active
```

Overlap query (in `upsertMultiplier`):
```sql
SELECT name FROM entry_multipliers 
WHERE sweepstake_id = $sweepstakeId AND is_active = true AND id != $editingId
  AND start_at < $newEndAt AND end_at > $newStartAt
LIMIT 1
```
If found: save proceeds but return `{ warning: 'Overlaps with: {name}' }`. The client component shows a warning toast.

### 16.4 Admin Coupons — `src/app/(admin)/admin/coupons/page.tsx`

Replace placeholder. Same server page pattern. Table columns: Code, Name, Type (badge), Value, Uses, Expires, Active (toggle), Edit link.

### 16.5 Coupon Create/Edit — `src/app/(admin)/admin/coupons/new/page.tsx` and `[id]/page.tsx`

`CouponForm` client component. Code input: `onBlur={() => setCode(code.toUpperCase())}`. In edit mode: code input has `disabled` + `readOnly`.

Server Actions:
```typescript
// createCoupon(formData): insert, redirect('/admin/coupons')
// updateCoupon(id, formData): update (exclude `code` from update payload), redirect
// toggleCoupon(id, is_active): update is_active
```

### 16.6 Admin No-Sweepstake Warning — `src/app/(admin)/admin/products/page.tsx`

In `AdminProductsPage`, add before heading:
```typescript
const { data: activeSweepstake } = await adminClient
  .from('sweepstakes').select('id').eq('status', 'active').maybeSingle()
```

Render:
```tsx
{!activeSweepstake && (
  <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 mb-4 text-sm font-medium">
    ⚠️ No active sweepstake — purchases are not earning entries
  </div>
)}
```

---

## 17. Vitest Setup

### 17.1 `vitest.config.ts` (project root)

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

### 17.2 `src/lib/__tests__/sweepstakes.test.ts`

Tests import only `calculateEntries` and `computeLeadCaptureEntries` (pure functions — no DB). No mocking needed.

**5 calculateEntries test cases:**
1. `custom_entry_amount=50, listPriceCents=2000, pricePaidCents=2000, activeMultiplierMax=null, coupon=null` → `{ baseEntries:50, multiplier:1.0, couponMultiplier:1.0, bonusEntries:0, totalEntries:50 }`
2. `custom_entry_amount=null, listPriceCents=2000, pricePaidCents=1000, activeMultiplierMax=null, coupon=null` → `{ baseEntries:20, totalEntries:20 }`
3. `custom_entry_amount=50, listPriceCents=2000, pricePaidCents=2000, activeMultiplierMax=2.0, coupon=null` → `{ totalEntries:100 }`
4. `custom_entry_amount=50, listPriceCents=2000, activeMultiplierMax=2.0, coupon:{entry_type:'multiplier', entry_value:1.5}` → `{ totalEntries:150 }` (floor(50 * 2.0 * 1.5) = floor(150) = 150)
5. `custom_entry_amount=50, listPriceCents=2000, activeMultiplierMax=2.0, coupon:{entry_type:'fixed_bonus', entry_value:25}` → `{ totalEntries:125 }` (floor(50 * 2.0 * 1.0) + 25 = 100 + 25)

**1 computeLeadCaptureEntries test case:**
- `computeLeadCaptureEntries(3, null)` → `3`
- `computeLeadCaptureEntries(3, 10)` → `10` (sample product custom_entry_amount takes priority)

---

## 18. Non-Functional Requirements

### Caching
- `getActiveSweepstakeData()` (EntryBadge): `unstable_cache` 60s, tag `'active-sweepstake'`
- `getActiveMultiplier()` (MultiplierBanner): `unstable_cache` 60s, tag `'active-multiplier'`
- Tags are invalidated via `revalidateTag` in Server Actions when sweepstake/multiplier status changes

### Error Handling
- API routes: all unexpected errors → `500 { error: 'Internal error' }`, console.error logged
- Email sends: try/catch, log on failure, never throw — success response returned regardless
- `refreshEntryVerification()`: catches errors, logs, never rethrows
- Auth callback lead linking: fire-and-forget `.catch()`, never blocks redirect

### TypeScript Strictness
- All new files: strict mode compatible
- No `any` in new code (exception: type casts for Supabase join shapes, following existing webhook handler pattern)
- All exported functions have explicit return types

### Build
- No RSC/client boundary violations: async server components never imported inside `'use client'` files
- `MultiplierBannerClient` is a separate file to avoid mixing `'use client'` with server component in same file
- `LeadCapturePopup` is `'use client'` — wrapped in Suspense in root layout to avoid blocking
- `EntryBadge` used in `/library/[slug]` server page (safe) and NOT embedded in `ProductCard` (client-side list renders use `sweepData` prop pattern instead)
