# PRD_REPORT.md — Phase 4A: Sweepstakes Core
**PRD Agent Output — Fortification Mode**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core

---

## 1. Status

**WARN**

All requirements are complete, consistent, and architecturally ready. Seven findings are noted below (F1–F7). None are blockers; all are advisory findings the Architect must account for during implementation. The Architect may proceed immediately.

---

## 2. Fortified Requirements

### R1 — Entry Calculation Engine (`src/lib/sweepstakes.ts`)

**R1.1 — `calculateEntries(params)`** — Pure function (no DB access). Receives:
```typescript
{
  product: { price_cents: number, member_price_cents: number, custom_entry_amount: number | null },
  listPriceCents: number,        // ALWAYS the full list price (pre-discount, pre-member-price)
  pricePaidCents: number,        // actual amount charged — stored for audit only, never used in calculation
  sweepstakeId: string,
  couponId?: string,
  // Caller must supply resolved DB values:
  activeMultiplierMax?: number,  // MAX(multiplier) from entry_multipliers for this sweepstake, or null
  coupon?: { entry_type: 'multiplier' | 'fixed_bonus', entry_value: number } | null,
}
```
Returns:
```typescript
{ baseEntries, multiplier, couponMultiplier, bonusEntries, totalEntries, listPriceCents, amountCents }
```

Calculation rules:
- `baseEntries` = `product.custom_entry_amount` if non-null, else `Math.floor(listPriceCents / 100)`
- `globalMultiplier` = `activeMultiplierMax ?? 1.0`
- If `coupon.entry_type === 'multiplier'`: `couponMultiplier = coupon.entry_value`; else `couponMultiplier = 1.0`
- If `coupon.entry_type === 'fixed_bonus'`: `bonusEntries = coupon.entry_value`; else `bonusEntries = 0`
- `totalEntries = Math.floor(baseEntries * globalMultiplier * couponMultiplier) + bonusEntries`

**R1.2 — `awardPurchaseEntries(params)`** — Async, performs DB writes. Receives:
```typescript
{
  orderId: string,
  orderItemId: string | null,
  productId: string,
  userId: string,
  sweepstakeId: string,
  listPriceCents: number,
  pricePaidCents: number,
  couponId?: string,
}
```
- Queries DB for: active multiplier MAX, coupon details (if couponId provided), product fields
- Calls `calculateEntries()` with resolved values
- Inserts `sweepstake_entries` row: `source = 'purchase'`, all calculated fields, `order_id`, `order_item_id`, `product_id`, `user_id`, `sweepstake_id`
- `list_price_cents` = listPriceCents; `amount_cents` = pricePaidCents
- After insert: calls `refreshEntryVerification()`
- Returns `{ totalEntries }` on success, `null` if no active sweepstake found

**R1.3 — `awardLeadCaptureEntries(params)`** — Async, performs DB writes. Receives:
```typescript
{
  leadCaptureId: string,
  userId?: string,
  sweepstakeId: string,
  sampleProductId?: string,
}
```
- Base entries = `sample_product.custom_entry_amount` (if sampleProductId provided and custom_entry_amount is set) OR `sweepstake.non_purchase_entry_amount`
- NO multipliers (`multiplier = 1.0`), NO coupons (`coupon_multiplier = 1.0`), `bonusEntries = 0`
- `totalEntries = baseEntries`
- Inserts `sweepstake_entries` row: `source = 'non_purchase_capture'`, `lead_capture_id = leadCaptureId`, `user_id` may be null
- Returns `{ totalEntries }`

**R1.4 — `refreshEntryVerification()`** — Debounced. Executes `REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification`. Skip refresh if last refresh occurred within 60 seconds (track via module-level variable). Non-blocking (fire-and-forget from callers).

**R1.5 — Unit tests** — Vitest unit tests covering:
- `calculateEntries()`: 5 test cases from blueprint §5.1 and §5.2 (custom_entry_amount, dollar-based list price, global multiplier, coupon multiplier type, coupon fixed_bonus type)
- `awardLeadCaptureEntries()`: returns correct base entries = sweepstake.non_purchase_entry_amount; multiplier=1.0, coupon_multiplier=1.0; totalEntries = baseEntries

**Note:** `calculateEntries()` MUST be a pure function (no DB calls inside it). The caller (`awardPurchaseEntries`) is responsible for fetching the `activeMultiplierMax` and `coupon` from DB before calling `calculateEntries()`. This enables Vitest tests to run without a DB connection.

---

### R2 — Wire Entry Awarding into Webhook

Replace the `// TODO Phase 4A` stubs in `src/app/api/webhooks/stripe/route.ts`:

**R2.1 — `checkout.session.completed` (payment mode):** After the `order_items` insert and before the `sendEmail` fire-and-forget call, call `awardPurchaseEntries()` for the single order_item. Available context at that call site:
- `orderId` = `newOrderId`
- `orderItemId` = id returned from `order_items` insert (must add `.select('id').single()` — see F4)
- `productId` = `ebook.product_id`
- `userId` = resolved at top of handler
- `sweepstakeId` = queried from active sweepstake (query inside `awardPurchaseEntries`)
- `listPriceCents` = `product.price_cents`
- `pricePaidCents` = `session.amount_total ?? 0`
- `couponId` = `session.metadata?.coupon_id ?? null`

**R2.2 — `checkout.session.completed` (subscription mode / combined checkout):** `entries_awarded_by_checkout` is already set to `true` on this order. After the subscription upsert, call `awardPurchaseEntries()` for the e-book item (only if `ebookId` exists and the ebook was successfully looked up). The `entries_awarded_by_checkout = true` flag on the order is the dedup marker used by the `invoice.paid` handler.

**R2.3 — `invoice.paid`:** After the order INSERT, before the `sendEmail` fire-and-forget:
- Dedup check: query `orders WHERE user_id = sub.user_id AND entries_awarded_by_checkout = true AND is_subscription_renewal = false ORDER BY created_at ASC LIMIT 1`. If a row exists, skip entry awarding.
- If no combined-checkout order: insert a renewal `order_items` row for the subscription product, then call `awardPurchaseEntries()`. `listPriceCents` = product.price_cents; `pricePaidCents` = invoice.amount_paid.

---

### R3 — Lead Capture API (`POST /api/lead-capture`)

- **Route:** `POST /api/lead-capture` — public, no auth required
- **Rate limit:** 5 requests per IP per hour via `@upstash/ratelimit` + `@upstash/redis`. If Upstash env vars not present: skip rate limiting, log `[lead-capture] Upstash not configured — skipping rate limit`
- **Request body:** `{ email: string, phone?: string, source: 'popup' | 'footer' | 'marketplace_coming_soon' | 'sample_product', sweepstakeId?: string, sampleProductId?: string }`
- **Validation:** `email` must be a valid email format (basic regex). If invalid: return `400 { error: 'Invalid email' }`
- **Find sweepstake:** If `sweepstakeId` provided: use it. Else: query `sweepstakes WHERE status = 'active' LIMIT 1`. If no active sweepstake found: create lead_captures row with `sweepstake_id = NULL`, skip confirmation email, return `200 { success: true, noActiveSweepstake: true }`
- **Duplicate check:** Query `lead_captures WHERE email = $email AND sweepstake_id = $sweepstakeId`. If found: return `200 { duplicate: true, message: "You've already entered" }`
- **Insert:** Create `lead_captures` row with `confirmed_at = NULL`, `entry_awarded = false`, `confirmation_token = crypto.randomUUID()`, `confirmation_sent_at = NOW()`, `source`, `sweepstake_id`, `sample_product_id` (if provided), `ip_address` from request headers
- **Send email:** Call Resend with `lead_capture_confirm` template (source != 'sample_product') or `sample_product_confirm` (source = 'sample_product'). If send fails: log error, do NOT throw — return success regardless
- **Return:** `200 { success: true }`

---

### R4 — Email Confirmation API (`POST /api/lead-capture/confirm`)

- **Route:** `POST /api/lead-capture/confirm` — public, no auth required
- **Request body:** `{ token: string }`
- **Lookup:** Query `lead_captures WHERE confirmation_token = $token`. If not found: return `404 { error: 'Invalid or expired token' }`
- **Already confirmed:** If `confirmed_at IS NOT NULL`: return `200 { alreadyConfirmed: true, entries: <total_entries from sweepstake_entries WHERE lead_capture_id = this id>, source }`
- **Expired:** If `confirmation_sent_at < NOW() - interval '72 hours'`: return `410 { error: 'Token expired', email: lead_captures.email }`
- **Confirm:** Set `confirmed_at = NOW()`, `entry_awarded = true`
- **Award entries:** Call `awardLeadCaptureEntries({ leadCaptureId, userId: lead_captures.user_id, sweepstakeId: lead_captures.sweepstake_id, sampleProductId: lead_captures.sample_product_id })`
- **Redirect logic:**
  - If `source = 'sample_product'`: join to `sample_products` to get slug, return `200 { redirect: '/free/{slug}/download?token={token}' }`
  - Else: return `200 { success: true, entries: totalEntries, source, sweepstake: { title, prize_description } }`
- **Idempotent:** The `confirmed_at` check above handles re-confirmation gracefully

---

### R5 — Resend Confirmation API (`POST /api/lead-capture/resend`)

- **Route:** `POST /api/lead-capture/resend` — public, no auth required
- **Rate limit:** 1 request per 5 minutes per email via Upstash. Key: `resend_confirm:{email}`. If Upstash not configured: skip, log warning
- **Request body:** `{ email: string }`
- **Lookup:** Query `lead_captures WHERE email = $email AND confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1`
- **Not found:** Return `200` silently (prevent email enumeration)
- **Too soon:** If `confirmation_sent_at > NOW() - interval '5 minutes'`: return `429 { error: 'Too soon' }`
- **Expired:** If `confirmation_sent_at < NOW() - interval '72 hours'`: return `410 { error: 'Expired', message: 'This link has expired. Please re-submit your email.' }`
- **Resend:** Regenerate `confirmation_token = crypto.randomUUID()`, update `confirmation_sent_at = NOW()`, resend confirmation email
- **Return:** `200 { success: true }`

---

### R6 — Lead Capture Popup (`src/components/sweepstakes/LeadCapturePopup.tsx`)

- **Client component.** Trigger conditions: `setTimeout(10000)` OR `window.scrollY >= document.body.scrollHeight * 0.5` — whichever fires first.
- **Suppression:**
  - `localStorage.getItem('omni_popup_dismissed')`: if set, compare timestamp; re-show only if > 30 days ago. On dismiss: set `omni_popup_dismissed` to current ISO timestamp.
  - `localStorage.getItem('omni_popup_submitted')`: if set (any value), never show again. On successful submit: set `omni_popup_submitted = '1'`.
- **UI:** shadcn `Dialog` component. Content:
  - Headline: "🎟️ Enter for a chance to win ${prize_amount}" (prize_amount passed as prop from server parent or fetched via client API)
  - Email input (type=email, required, placeholder "your@email.com")
  - Phone input (type=tel, optional, placeholder "Phone (optional)")
  - Submit button: "Enter Sweepstakes"
- **On submit:** `POST /api/lead-capture` with `{ email, phone, source: 'popup' }`. Show loading state on button during fetch.
- **Success state:** Replace form content with: "📧 Check your email to confirm your entry!" + "Resend email" button (calls `POST /api/lead-capture/resend` with `{ email }`)
- **Error state:** Show inline error message below form on non-200 response
- **Also export:** `LeadCaptureForm` (same form logic, no popup/dialog wrapper, no trigger behavior) for use on marketplace page and footer

---

### R7 — Email Confirmation Page (`/confirm/[token]`)

- **Route:** `src/app/confirm/[token]/page.tsx` — public, no auth required. Client component (uses `useEffect` to call confirm API on mount).
- **On mount:** Call `POST /api/lead-capture/confirm` with `{ token }` (token from URL params).
- **Loading state:** Show spinner while API call is in-flight.
- **If source = 'sample_product':** Redirect to `/free/{slug}/download?token={token}` (using `router.replace()`).
- **Success state (popup/other):**
  - "✅ You're in! You earned {N} entries in the {sweepstake_title} sweepstake."
  - CTA buttons: "Browse the E-book Library" (href=/library) + "Join Omni Membership" (href=/pricing)
  - If active multiplier: inline callout "{M}X entry bonus active on all purchases!"
- **Error states:**
  - `404` / invalid token: "This link is invalid. Submit your email again." + link to homepage
  - `410` expired: "This link has expired (72 hours). Enter your email again to get a new one." + inline email re-submit form (calls `POST /api/lead-capture` directly with the email from the 410 response body)
  - `200 { alreadyConfirmed: true }`: "You've already confirmed! You have {N} entries." + same upsell CTAs

---

### R8 — Lead → Account Linking

- **Location:** `src/app/api/auth/callback/route.ts`, after `supabase.auth.exchangeCodeForSession(code)` succeeds (`!error`), before the redirect.
- **Must use `adminClient` (service role)** to execute the UPDATE — the session-scoped client may not have permission to UPDATE sweepstake_entries via RLS at callback time.
- Resolve `new_user_id` via `supabase.auth.getUser()` after session exchange.
- Execute:
  ```sql
  UPDATE sweepstake_entries
  SET user_id = $new_user_id
  WHERE lead_capture_id IN (
    SELECT id FROM lead_captures WHERE user_id = $new_user_id
  )
  AND user_id IS NULL
  ```
- If UPDATE fails: log error but do NOT block the redirect. Lead linking is background enrichment, not a critical path gate.
- **Note:** The `handle_new_user` DB trigger already links `lead_captures.user_id` on signup (by matching email). This R8 step handles `sweepstake_entries` rows for leads that confirmed BEFORE signing up.

---

### R9 — Admin Sweepstakes CRUD (`/admin/sweepstakes`)

- List page: table of all sweepstakes with columns: title, status (badge), prize_amount_cents (formatted as $), start_at, end_at, actions (Edit / Activate / End)
- Create/edit form fields: title (required), description, prize_amount_cents (integer cents, display as dollars), prize_description, start_at (datetime), end_at (datetime), non_purchase_entry_amount (integer, default 1), official_rules_url
- **Activate:** Sets `status = 'active'`. Pre-check: query `sweepstakes WHERE status = 'active' AND id != $this_id`. If found: return error "Another sweepstake is already active: {title}". Also handle the DB `idx_sweepstakes_single_active` partial unique index violation as a fallback.
- **End:** Sets `status = 'ended'`. No pre-check needed.
- Status badge colors: draft (gray), active (green), ended (yellow), drawn (purple)

---

### R10 — Admin Multipliers (`/admin/sweepstakes/[id]/multipliers`)

- List: table of multipliers for selected sweepstake: name, multiplier value, start_at, end_at, is_active (toggle), edit button
- Create/edit form fields: name (required), description, multiplier value (numeric > 0, stored as NUMERIC(5,2)), start_at (datetime, required), end_at (datetime, required, must be > start_at), is_active (toggle, default true)
- **Overlap warning:** On save, check `entry_multipliers WHERE sweepstake_id = $id AND is_active = true AND id != $this_id AND start_at < $new_end_at AND end_at > $new_start_at`. If overlap found: show inline warning "Warning: overlaps with existing active multiplier '{name}'" but allow save.
- Toggle: inline toggle on list to flip `is_active`

---

### R11 — Admin Coupons (`/admin/coupons`)

- List: table of all coupons: code, name, entry_type, entry_value, current_uses / max_uses_global (show as N / unlimited if null), expires_at, is_active toggle
- Create/edit form:
  - `code`: text input, auto-uppercased on `onBlur`. **Immutable after creation** — field disabled in edit mode.
  - `name`: text
  - `entry_type`: select (multiplier / fixed_bonus)
  - `entry_value`: number (multiplier: decimal e.g. 2.0; fixed_bonus: integer)
  - `max_uses_global`: integer or blank (unlimited)
  - `max_uses_per_user`: integer, default 1
  - `expires_at`: datetime or blank
  - `sweepstake_id`: optional dropdown of all sweepstakes
  - `is_active`: toggle
- Toggle: inline toggle on list to flip `is_active`

---

### R12 — Entry Badge Component (`src/components/sweepstakes/EntryBadge.tsx`)

- **Server component.** Props: `{ product: { price_cents: number, custom_entry_amount: number | null }, className?: string }`
- Fetches: active sweepstake + active multiplier MAX via `unstable_cache` with 60s TTL (single query: active sweepstake → active multiplier for that sweepstake)
- Computes `baseEntries` = `custom_entry_amount ?? Math.floor(price_cents / 100)`
- If active multiplier exists: render `"🔥 {M}X ENTRIES — Earn {N} entries"` where N = `Math.floor(baseEntries * multiplier)`
- Else: render `"🎟️ Earn {N} entries"`
- Returns `null` (renders nothing) if no active sweepstake

---

### R13 — Multiplier Banner (`src/components/sweepstakes/MultiplierBanner.tsx`)

- **Pattern:** Async server component for data fetch; inner client component for dismiss state.
- Fetches: active multiplier for active sweepstake, via `unstable_cache` 60s TTL
- If active multiplier: renders banner: "{multiplier.name} — {M}X entries on all purchases! Ends {end_at formatted as 'Mon DD, YYYY'}"
- Dismiss: client-side `useState` only — `showBanner` defaults to `true`, X button sets to `false`. Re-shows on page load. NOT localStorage.
- **Wired into root layout:** Replace `<div id="multiplier-banner-slot" />` at line 44 of `src/app/layout.tsx` with `<MultiplierBanner />` (wrapped in `<Suspense fallback={null}>` to avoid blocking layout render).

---

### R14 — Wire Entry Badges on Library

- **`/library` page:** Add `<EntryBadge product={product} />` to each product card in the library grid
- **`/library/[slug]` detail page:** Show `<EntryBadge product={product} />` in the product detail. Add informational note: "Members earn {N} entries (based on full ${X} price)" where N = `Math.floor(price_cents / 100)` and X = formatted dollar amount. Visible to all users.

---

### R15 — Admin No-Sweepstake Warning

- On `/admin` dashboard page AND `/admin/products` list page: query `sweepstakes WHERE status = 'active' LIMIT 1`. If no result: render amber warning banner at top of content area: "⚠️ No active sweepstake — purchases are not earning entries". Non-dismissable.

---

## 3. Acceptance Criteria

1. `calculateEntries({ product: { custom_entry_amount: 50 }, listPriceCents: 2000, pricePaidCents: 2000, activeMultiplierMax: null, coupon: null })` returns `{ baseEntries: 50, multiplier: 1.0, couponMultiplier: 1.0, bonusEntries: 0, totalEntries: 50 }`
2. `calculateEntries({ product: { custom_entry_amount: null }, listPriceCents: 2000, pricePaidCents: 1000, activeMultiplierMax: null, coupon: null })` returns `{ baseEntries: 20, totalEntries: 20 }` (member discount — pricePaid irrelevant)
3. `calculateEntries({ product: { custom_entry_amount: 50 }, listPriceCents: 2000, pricePaidCents: 2000, activeMultiplierMax: 2.0, coupon: null })` returns `{ totalEntries: 100 }`
4. `calculateEntries({ product: { custom_entry_amount: 50 }, listPriceCents: 2000, pricePaidCents: 2000, activeMultiplierMax: 2.0, coupon: { entry_type: 'multiplier', entry_value: 1.5 } })` returns `{ totalEntries: 150 }` (floor(50 * 2.0 * 1.5))
5. `calculateEntries({ product: { custom_entry_amount: 50 }, listPriceCents: 2000, pricePaidCents: 2000, activeMultiplierMax: 2.0, coupon: { entry_type: 'fixed_bonus', entry_value: 25 } })` returns `{ totalEntries: 125 }` (floor(50 * 2.0 * 1.0) + 25)
6. `awardLeadCaptureEntries()` inserts a `sweepstake_entries` row with `source = 'non_purchase_capture'`, `multiplier = 1.0`, `coupon_multiplier = 1.0`, `bonus_entries = 0`, `total_entries = sweepstake.non_purchase_entry_amount`
7. `POST /api/lead-capture` with valid email and active sweepstake: returns `200 { success: true }` and creates `lead_captures` row with `confirmed_at = NULL`, `entry_awarded = false`
8. `POST /api/lead-capture` with same email + sweepstake_id a second time: returns `200 { duplicate: true }`
9. `POST /api/lead-capture/confirm` with valid unconfirmed non-expired token: sets `confirmed_at`, sets `entry_awarded = true`, creates `sweepstake_entries` row, returns `200 { success: true, entries: N, source, sweepstake: {...} }`
10. `POST /api/lead-capture/confirm` with token where `confirmation_sent_at < NOW() - 72h`: returns `410 { error: 'Token expired', email }`
11. `POST /api/lead-capture/confirm` with already-confirmed token: returns `200 { alreadyConfirmed: true, entries: N, source }`
12. `POST /api/lead-capture/confirm` with `source = 'sample_product'`: returns `200 { redirect: '/free/{slug}/download?token={token}' }`
13. `POST /api/lead-capture/resend` with valid pending email where `confirmation_sent_at` is > 5 minutes old: regenerates token, updates `confirmation_sent_at`, returns `200`
14. `POST /api/lead-capture/resend` where `confirmation_sent_at < 5 minutes ago`: returns `429`
15. Stripe webhook `checkout.session.completed` (payment mode): `sweepstake_entries` row created with `source = 'purchase'`, correct `order_id`, `order_item_id`, `product_id`, `user_id`, computed `total_entries`
16. Stripe webhook `checkout.session.completed` (subscription/combined mode): `sweepstake_entries` row created for e-book item; `entries_awarded_by_checkout = true` on the order
17. Stripe webhook `invoice.paid` (amount > 0, not proration): `sweepstake_entries` row created for renewal when no combined-checkout order exists for that user
18. Stripe webhook `invoice.paid` where user has `entries_awarded_by_checkout = true` order: NO new `sweepstake_entries` row created (dedup)
19. Stripe webhook `invoice.paid` with `amount_paid = 0`: no entries created, returns 200 immediately (existing behavior preserved)
20. `/confirm/[token]` page with valid confirmed token: renders "✅ You're in!" state with entry count and upsell CTAs
21. `/confirm/[token]` page with invalid token: renders error state with link to homepage
22. `/confirm/[token]` page with expired token: renders expired state with email re-submit form
23. `LeadCapturePopup` appears in root layout; triggers after 10s; does not appear if `omni_popup_submitted` is set in localStorage; dismissed state stored in `omni_popup_dismissed`
24. `EntryBadge` renders correct entry count on library product cards; renders nothing when no active sweepstake
25. `MultiplierBanner` renders in layout when active multiplier exists; X button dismisses (client state only, re-shows on reload); renders nothing when no active multiplier
26. Admin: create sweepstake, activate it; attempting to activate a second sweepstake shows error "Another sweepstake is already active"
27. Admin: create, edit, and toggle active status of a multiplier; overlapping multiplier period shows warning but saves successfully
28. Admin: create coupon with lowercase code — code is uppercased on blur; code field is disabled in edit mode
29. Admin dashboard and `/admin/products` show amber warning banner when no active sweepstake exists
30. `npm run build` passes with no errors
31. `npx tsc --noEmit` passes with 0 type errors
32. Vitest unit tests for `calculateEntries()` (5 cases per §5.1/§5.2 of blueprint) pass; `awardLeadCaptureEntries()` base-entries test passes

---

## 4. Cross-Phase Dependencies

| Decision | Phase Decided | Constraint |
|---|---|---|
| Supabase clients: `client.ts` (browser), `server.ts` (server), `admin.ts` (service role) | Phase 1 | Entry API routes and R8 linking must use `adminClient` for all DB writes (service role bypasses RLS for trusted server operations) |
| All migrations in `supabase/migrations/` | Phase 1 | No new migrations needed for Phase 4A — all sweepstakes tables (`sweepstakes`, `entry_multipliers`, `coupons`, `coupon_uses`, `sweepstake_entries`, `lead_captures`, `sample_products`) and materialized view (`entry_verification`) were created in Phase 1 migrations |
| `processed_stripe_events` idempotency via `claim_stripe_event` RPC | Phase 3 | Webhook handler's idempotency guard is in place; Phase 4A entry awarding happens WITHIN the existing try blocks — no new idempotency layer needed |
| `entries_awarded_by_checkout` and `is_subscription_renewal` columns on `orders` table | Phase 3 | Both columns confirmed present in `20240101000005_orders_billing.sql`. Dedup logic in R2.3 uses these. |
| Webhook handler structure with `// TODO Phase 4A` stubs | Phase 3 | Stubs at lines 193 (payment), 292 (subscription/combined), and 497 (invoice.paid) of `src/app/api/webhooks/stripe/route.ts` |
| React Email + Resend pattern (`src/lib/email.tsx`) | Phase 3 | Confirmation email templates must follow the same pattern: React Email `.tsx` components in `src/emails/`, rendered with `render()` before passing to Resend |
| `@upstash/ratelimit` v2.0.8 + `@upstash/redis` v1.37.0 in `dependencies` | Phase 3 | Both packages are installed. No `npm install` needed for rate limiting. |
| shadcn Dialog component | Phase 1 | `LeadCapturePopup` uses shadcn Dialog — confirmed installed |
| Root layout multiplier banner slot | Phase 1 | `<div id="multiplier-banner-slot" />` confirmed present at line 44 of `src/app/layout.tsx` — replace with `<MultiplierBanner />` |
| `entry_source` enum: `'purchase' | 'non_purchase_capture' | 'admin_adjustment' | 'coupon_bonus'` | Phase 1 | `sweepstake_entries.source` column uses this enum; Phase 4A uses `'purchase'` and `'non_purchase_capture'` only |

---

## 5. Scope Boundaries

The following are explicitly OUT OF SCOPE for Phase 4A:

- Sample product landing pages (`/free/[slug]`) and download pages (`/free/[slug]/download`) — Phase 4B
- Admin user management (`/admin/users`, `/admin/users/[id]`) and per-user entry adjustment — Phase 4B
- Entry export CSV (`/admin/sweepstakes/[id]/export`) — Phase 4B
- User-facing entries history page (`/profile/entries`) — Phase 4B
- Public sweepstakes page (`/sweepstakes`) and rules page (`/sweepstakes/rules`) — Phase 4B
- Drawing / winner selection mechanics — Phase 4B
- `awardAdminAdjustment()` function (referenced in blueprint §4.1 task list but not in this phase's PRD requirements) — Phase 4B
- New Supabase migrations — no schema changes required; all tables exist

---

## 6. Findings

### F1 — WARN: `calculateEntries()` must be a pure function to be unit-testable

**Finding:** The PRD requires Vitest unit tests for `calculateEntries()` (AC #32), but the blueprint §5.1 pseudocode shows `calculateEntries()` making DB queries internally. A function that makes DB calls cannot be tested without a live database.

**Resolution (Fortified in R1.1):** `calculateEntries()` MUST be a pure function that receives pre-fetched `activeMultiplierMax` and `coupon` as parameters. The caller (`awardPurchaseEntries`) fetches those values from the DB before calling `calculateEntries()`. The fortified signature in R1.1 above reflects this. Product behavior is identical to the blueprint's intent.

**Architect must implement this way** — using the in-function DB query pattern from the blueprint pseudocode would make the unit tests impossible.

---

### F2 — WARN: R3 behavior when no active sweepstake exists

**Finding:** R3 does not specify what to do if no sweepstake is active and no `sweepstakeId` was provided in the request body.

**Resolution (Fortified in R3):** Create the `lead_captures` row with `sweepstake_id = NULL` (valuable for marketing email capture), skip confirmation email (no entries to confirm), return `200 { success: true, noActiveSweepstake: true }`. The `unique_email_per_sweep` DB constraint allows NULLs in `sweepstake_id` (Postgres NULLs are never equal for UNIQUE purposes).

---

### F3 — WARN: Auth callback route must use `adminClient` for R8 UPDATE

**Finding:** `src/app/api/auth/callback/route.ts` currently creates a session-scoped `createServerClient` with the ANON key. The R8 `sweepstake_entries` UPDATE would be blocked by RLS using the anon client.

**Resolution (Fortified in R8):** R8 must use `adminClient` (imported from `@/lib/supabase/admin`) for the UPDATE. The session-scoped client is used only to call `supabase.auth.getUser()` to resolve the user ID.

---

### F4 — WARN: `order_items` insert in payment webhook does not capture returned `id`

**Finding:** In `checkout.session.completed` (payment mode), line 177 of the webhook handler calls `await adminClient.from('order_items').insert({...})` without `.select('id').single()`. When R2.1 calls `awardPurchaseEntries()`, it requires the `orderItemId`.

**Resolution (Fortified in R2.1):** The Architect must add `.select('id').single()` to the `order_items` insert at line 177 and capture the returned row ID. This is a confined change within the existing payment mode try block.

---

### F5 — WARN: Renewal `invoice.paid` path needs an `order_items` row

**Finding:** The current `invoice.paid` handler does not create an `order_items` row for renewal invoices. The `sweepstake_entries.UNIQUE(order_item_id, sweepstake_id)` constraint uses `order_item_id`; if NULL, Postgres UNIQUE does not deduplicate renewals at the DB level (NULLs are never equal). Idempotency relies entirely on `processed_stripe_events`, which is correct but less defensible.

**Resolution (Fortified in R2.3):** The Architect should insert a renewal `order_items` row for invoice renewals and pass the returned ID to `awardPurchaseEntries()`. Renewal `order_items` row: `product_id` from `subscriptions.product_id`, `product_type` = 'membership_monthly' or 'membership_annual' (from product record), `product_title` from product lookup, `quantity = 1`, `unit_price_cents = invoice.amount_paid`, `list_price_cents = product.price_cents`.

---

### F6 — WARN: Vitest is not installed

**Finding:** Vitest is absent from `package.json` (neither `dependencies` nor `devDependencies`). Unit tests are required by AC #32.

**Resolution:** The Backend agent must install Vitest. Add to `devDependencies`:
```json
"vitest": "^2.0.0",
"@vitest/coverage-v8": "^2.0.0"
```
Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```
Create a minimal `vitest.config.ts` at the project root. No DOM or test setup is needed since `calculateEntries()` is a pure function.

---

### F7 — WARN: Multiplier banner slot is a bare `<div>` — needs Suspense wrapping

**Finding:** `src/app/layout.tsx` line 44 has `<div id="multiplier-banner-slot" />`. Replacing it with an async Server Component (`<MultiplierBanner />`) that awaits a Supabase query would block the root layout render until the query completes.

**Resolution (Fortified in R13):** Wrap `<MultiplierBanner />` in `<Suspense fallback={null}>` when inserting it into the root layout. This ensures the rest of the layout (Navbar, main content) renders immediately while the banner data loads asynchronously. The server component itself should be async and use `unstable_cache` with a 60s TTL to minimize latency.
