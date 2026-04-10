# TASKS.md — Phase 4A: Sweepstakes Core
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core

All tasks are ordered by dependency. Each task is atomic and testable. Reference SPEC.md sections for full detail.

---

## [BACKEND]

### B1 — Install Vitest and create vitest.config.ts
**File:** `package.json`, `vitest.config.ts`
- Add `"vitest": "^2.0.0"` and `"@vitest/coverage-v8": "^2.0.0"` to `devDependencies`
- Add `"test": "vitest run"` and `"test:watch": "vitest"` to `scripts`
- Create `vitest.config.ts` at project root (SPEC §17.1)
- Verify: `npm install` completes without errors

### B2 — Create DB migration: refresh_entry_verification function
**File:** `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql`
- Create Postgres function `public.refresh_entry_verification()` that calls `REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification` (SPEC §7)
- Function must use `SECURITY DEFINER` and `LANGUAGE plpgsql`
- Verify: function can be called via `adminClient.rpc('refresh_entry_verification')` without error on a seeded DB

### B3 — Create entry engine: `src/lib/sweepstakes.ts`
**File:** `src/lib/sweepstakes.ts`
- Export `calculateEntries()` — pure function per SPEC §8.1
- Export `computeLeadCaptureEntries()` — pure helper per SPEC §8.2
- Export `awardPurchaseEntries()` — async DB writer per SPEC §8.3
- Export `awardLeadCaptureEntries()` — async DB writer per SPEC §8.4
- Export `refreshEntryVerification()` — module-level debounced per SPEC §8.5
- Export `getActiveSweepstake()` — helper query per SPEC §8.6
- All `adminClient` imports from `@/lib/supabase/admin`
- Verify: TypeScript compiles with `npx tsc --noEmit`

### B4 — Write Vitest unit tests: `src/lib/__tests__/sweepstakes.test.ts`
**File:** `src/lib/__tests__/sweepstakes.test.ts`
**Depends on:** B1, B3
- Import `calculateEntries` and `computeLeadCaptureEntries` (pure functions only)
- Write 5 `calculateEntries` test cases per SPEC §17.2 (matching PRD_REPORT AC #1–5)
- Write 2 `computeLeadCaptureEntries` test cases per SPEC §17.2
- Verify: `npm test` runs and all 7 tests pass

### B5 — Wire webhook: payment mode entry awarding
**File:** `src/app/api/webhooks/stripe/route.ts`
**Depends on:** B3
- Add `.select('id').single()` to the `order_items` insert at line 177 (payment mode), capture `orderItemRow` (SPEC §9.1)
- Add import: `import { awardPurchaseEntries } from '@/lib/sweepstakes'`
- Replace `// TODO Phase 4A: award sweepstake entries (ebook purchase)` with active sweepstake query + conditional `awardPurchaseEntries()` call per SPEC §9.2
- If `adminClient.from('order_items').insert` fails (orderItemError): throw as before — no new error handling
- Verify: existing TypeScript types pass, `npm run build` succeeds

### B6 — Wire webhook: subscription/combined mode entry awarding
**File:** `src/app/api/webhooks/stripe/route.ts`
**Depends on:** B3, B5
- Add `.select('id').single()` to the `order_items` insert at line 246 (subscription/ebook item), capture `ebookOrderItemRow` (SPEC §9.3)
- Replace `// TODO Phase 4A: award sweepstake entries (combined checkout...)` with active sweepstake query + conditional `awardPurchaseEntries()` call per SPEC §9.4
- Note: `ebook` and `ebookId` are already in scope at this location
- Verify: `npx tsc --noEmit` passes

### B7 — Wire webhook: invoice.paid renewal entry awarding
**File:** `src/app/api/webhooks/stripe/route.ts`
**Depends on:** B3, B6
- Add `.select('id').single()` to the `orders.insert()` in the `invoice.paid` block (line 486), capture `renewalOrderId` per SPEC §9.5
- Replace `// TODO Phase 4A: award sweepstake entries (renewal...)` with dedup check + active sweepstake query + renewal `order_items` insert + `awardPurchaseEntries()` per SPEC §9.6
- The subscription product lookup queries `subscriptions` joined to `products` via `products!inner`
- Verify: `npx tsc --noEmit` passes; existing `invoice.paid` $0 early-return at line 447 is unchanged

### B8 — Create lead capture API: `POST /api/lead-capture`
**File:** `src/app/api/lead-capture/route.ts`
**Depends on:** B3
- Implement full flow per SPEC §10.2
- Export `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`
- Use `adminClient` for all DB operations
- Rate limit: `makeRateLimiter(5, '1 h')`, key `lead_capture:{ip}`; skip if Upstash not configured
- Duplicate check handles `sweepstake_id = null` case (no active sweepstake path)
- Email send in try/catch — failure does not block response
- Verify: POST with valid email returns `200 { success: true }` and creates lead_captures row; duplicate POST returns `{ duplicate: true }`

### B9 — Add email templates: `lead-capture-confirm` and `sample-product-confirm`
**Files:** `src/emails/lead-capture-confirm.tsx`, `src/emails/sample-product-confirm.tsx`, `src/lib/email.tsx`
**Depends on:** (none — standalone)
- Create `LeadCaptureConfirmEmail` per SPEC §11.1 (copy styling from `ebook-purchase.tsx`)
- Create `SampleProductConfirmEmail` per SPEC §11.2
- Add both to `TemplateKey` union, `SUBJECTS` map, and switch statement in `sendEmail()` per SPEC §11.3
- Verify: `npx tsc --noEmit` passes on email.tsx

### B10 — Create confirm API: `POST /api/lead-capture/confirm`
**File:** `src/app/api/lead-capture/confirm/route.ts`
**Depends on:** B3, B9
- Implement full flow per SPEC §10.3
- Expiry check: `new Date(lead.confirmation_sent_at).getTime() < Date.now() - 72 * 3600 * 1000`
- Query active multiplier for success state response (include `activeMultiplier` field)
- Handle `source === 'sample_product'` redirect logic
- Verify: valid token → 200 success + sweepstake_entries row created; expired → 410; already confirmed → 200 alreadyConfirmed

### B11 — Create resend API: `POST /api/lead-capture/resend`
**File:** `src/app/api/lead-capture/resend/route.ts`
**Depends on:** B9, B10
- Implement full flow per SPEC §10.4
- Rate limit: `makeRateLimiter(1, '5 m')`, key `resend_confirm:{email}`
- Silent 200 for not-found email (no enumeration)
- DB-level "too soon" guard as secondary check (for Upstash-absent environments)
- Verify: valid email with old token → 200 + new token in DB; too-soon → 429; expired → 410

### B12 — Update auth callback: R8 lead linking
**File:** `src/app/api/auth/callback/route.ts`
**Depends on:** B3
- Add `import { adminClient } from '@/lib/supabase/admin'`
- Replace `if (!error) { ... }` block with version that includes fire-and-forget sweepstake_entries UPDATE per SPEC §12
- UPDATE uses `adminClient` (not session-scoped client)
- Must use `.then(() => {}).catch(...)` pattern — never awaited, never blocks redirect
- The `supabase.auth.getUser()` call uses the session-scoped `supabase` client (correct — for reading user identity)
- Verify: `npx tsc --noEmit` passes; the callback route still redirects correctly on successful session exchange

---

## [FRONTEND]

### F1 — Create MultiplierBannerClient: `src/components/sweepstakes/MultiplierBannerClient.tsx`
**File:** `src/components/sweepstakes/MultiplierBannerClient.tsx`
**Depends on:** (none)
- `'use client'` directive
- Props: `{ name: string; multiplier: number; endAt: string }`
- `useState(true)` for `show`; X button sets `show = false`
- Render banner with amber background; format `endAt` with `toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })`
- Returns `null` if `!show`
- Verify: renders banner, X hides it

### F2 — Create MultiplierBanner: `src/components/sweepstakes/MultiplierBanner.tsx`
**File:** `src/components/sweepstakes/MultiplierBanner.tsx`
**Depends on:** F1
- Async server component (no `'use client'`)
- `unstable_cache` with 60s TTL, tag `'active-multiplier'` per SPEC §14.1
- Query: `entry_multipliers` with `sweepstakes!inner` join where `sweepstakes.status = 'active'` AND `is_active=true` AND date range
- Returns `null` if no data
- Renders `<MultiplierBannerClient ...>` with fetched data
- Verify: renders banner when active multiplier exists; renders nothing when none

### F3 — Create EntryBadge: `src/components/sweepstakes/EntryBadge.tsx`
**File:** `src/components/sweepstakes/EntryBadge.tsx`
**Depends on:** (none)
- Async server component, no `'use client'`
- `unstable_cache` 60s, tag `'active-sweepstake'` per SPEC §14.2
- Props: `{ product: { price_cents: number; custom_entry_amount: number | null }; className?: string }`
- Returns `null` if no active sweepstake
- Renders multiplier or plain entry count badge
- Verify: renders correct count; renders nothing with no active sweepstake; `npx tsc --noEmit` passes

### F4 — Create LeadCapturePopup + LeadCaptureForm: `src/components/sweepstakes/LeadCapturePopup.tsx`
**File:** `src/components/sweepstakes/LeadCapturePopup.tsx`
**Depends on:** (none)
- `'use client'` directive
- `LeadCapturePopup` export: trigger logic (10s timer + 50% scroll), suppression checks (localStorage), shadcn Dialog per SPEC §14.3
- `LeadCaptureForm` export: form-only version, accepts `source` and `onSuccess` props
- POST to `/api/lead-capture`; loading/success/error states
- localStorage keys: `omni_popup_submitted` and `omni_popup_dismissed`
- Verify: `npx tsc --noEmit` passes; no shadcn import errors

### F5 — Create LeadCapturePopupWrapper: `src/components/sweepstakes/LeadCapturePopupWrapper.tsx`
**File:** `src/components/sweepstakes/LeadCapturePopupWrapper.tsx`
**Depends on:** F4
- Async server component per SPEC §14.4
- Queries `adminClient` for active sweepstake `prize_amount_cents`
- Formats prize amount as "$N,NNN"
- Returns `null` if no active sweepstake
- Renders `<LeadCapturePopup prizeAmount={...} />`
- Verify: renders popup when sweepstake active; renders nothing otherwise

### F6 — Wire MultiplierBanner and LeadCapturePopupWrapper into root layout
**File:** `src/app/layout.tsx`
**Depends on:** F2, F5
- Replace `<div id="multiplier-banner-slot" />` (line 44) per SPEC §13:
  ```tsx
  <Suspense fallback={null}>
    <MultiplierBanner />
  </Suspense>
  <Suspense fallback={null}>
    <LeadCapturePopupWrapper />
  </Suspense>
  ```
- Add `import { Suspense } from 'react'`, `import MultiplierBanner from '@/components/sweepstakes/MultiplierBanner'`, `import { LeadCapturePopupWrapper } from '@/components/sweepstakes/LeadCapturePopupWrapper'`
- Verify: `npm run build` passes; layout renders without errors

### F7 — Create email confirmation page: `src/app/confirm/[token]/page.tsx`
**File:** `src/app/confirm/[token]/page.tsx`
**Depends on:** F4 (uses LeadCaptureForm for expired state)
- `'use client'` directive
- Uses `useParams()` for token
- `useEffect` on mount → POST `/api/lead-capture/confirm`
- All 5 states per SPEC §14.5: loading, success, already_confirmed, invalid, expired
- Expired state renders `<LeadCaptureForm source="popup" />` (import from LeadCapturePopup.tsx)
- Verify: page renders correct UI for each state; `npx tsc --noEmit` passes

### F8 — Update ProductCard: add sweepData prop
**File:** `src/components/library/product-card.tsx`
**Depends on:** (none)
- Add `custom_entry_amount?: number | null` to product interface
- Add optional `sweepData?: { hasActiveSweepstake: boolean; activeMultiplier: number | null } | null` prop
- Replace static "Earn entries" span with computed entry badge per SPEC §15.2
- ProductCard remains a server component (no `'use client'` directive exists; do not add one)
- Verify: `npx tsc --noEmit` passes; renders correctly with and without sweepData

### F9 — Update library page: fetch sweepData, add custom_entry_amount to query
**File:** `src/app/library/page.tsx`
**Depends on:** F3, F8
- Add `import { adminClient } from '@/lib/supabase/admin'`
- Add `custom_entry_amount` to the products select string
- Fetch `activeSweepstake` and `activeMultiplierRow` in parallel with `Promise.all` per SPEC §15.1
- Compute `sweepData` object
- Pass `sweepData` and `custom_entry_amount` to each `ProductCard`
- Update the `productCards` map to include `custom_entry_amount` from product row
- Verify: `npm run build` passes; entry badge text appears on library page

### F10 — Update ebook detail page: add EntryBadge and informational note
**File:** `src/app/library/[slug]/page.tsx`
**Depends on:** F3
- Add `import { Suspense } from 'react'` and `import { EntryBadge } from '@/components/sweepstakes/EntryBadge'`
- Add `<Suspense fallback={null}><EntryBadge ... /></Suspense>` and informational note per SPEC §15.3
- Note: `product.custom_entry_amount` is available via the `select('*, ebooks!inner(*)')` query
- Verify: badge renders on detail page; `npx tsc --noEmit` passes

### F11 — Admin sweepstakes: Server Actions file
**File:** `src/app/(admin)/admin/sweepstakes/actions.ts`
**Depends on:** (none)
- `'use server'` directive
- Export `activateSweepstake(id)` with pre-check + `revalidateTag` per SPEC §16.1
- Export `endSweepstake(id)` per SPEC §16.1
- Export `createSweepstake(formData)` and `updateSweepstake(id, formData)` per SPEC §16.2
- Verify: `npx tsc --noEmit` passes

### F12 — Admin sweepstakes: list page (replace placeholder)
**File:** `src/app/(admin)/admin/sweepstakes/page.tsx`
**Depends on:** F11
- Replace placeholder with full server page per SPEC §16.1
- Status badges with colors: draft=gray, active=green, ended=amber, drawn=purple
- Activate/End buttons in a `SweepstakeActions` client component that calls Server Actions and shows error toast on conflict
- Create `src/components/admin/sweepstake-actions.tsx` as the client component
- Verify: page renders sweepstakes list; activate/end buttons call correct actions

### F13 — Admin sweepstakes: create and edit form pages
**Files:** `src/app/(admin)/admin/sweepstakes/new/page.tsx`, `src/app/(admin)/admin/sweepstakes/[id]/page.tsx`
**Depends on:** F11
- Create shared `SweepstakeForm` client component (inline in page or `src/components/admin/sweepstake-form.tsx`)
- All fields per SPEC §16.2
- prize_amount_cents: display ÷ 100, store × 100
- Server Actions for submit
- Verify: create flow saves to DB and redirects; edit loads existing values

### F14 — Admin multipliers: page and form
**File:** `src/app/(admin)/admin/sweepstakes/[id]/multipliers/page.tsx`
**Depends on:** F11
- Server page per SPEC §16.3
- `upsertMultiplier` Server Action with overlap check (returns `{ warning }` if overlap)
- `toggleMultiplier` Server Action
- Client form shows warning toast when `warning` returned
- Verify: create multiplier saves; overlapping period shows warning but saves; toggle works

### F15 — Admin coupons: list page (replace placeholder)
**File:** `src/app/(admin)/admin/coupons/page.tsx`
**Depends on:** (none — standalone server page)
- Replace placeholder per SPEC §16.4
- Inline or separate Server Actions: `toggleCoupon(id, is_active)`, `createCoupon(formData)`, `updateCoupon(id, formData)`
- Table columns: Code, Name, Type, Value, Uses, Expires, Active toggle, Edit link
- Verify: page renders coupons list

### F16 — Admin coupons: create and edit form pages
**Files:** `src/app/(admin)/admin/coupons/new/page.tsx`, `src/app/(admin)/admin/coupons/[id]/page.tsx`
**Depends on:** F15
- `CouponForm` client component per SPEC §16.5
- Code field: `onBlur` uppercases; disabled+readOnly in edit mode
- All fields per SPEC §16.5
- Verify: create coupon saves; code uppercased on blur; code disabled in edit mode

### F17 — Admin no-sweepstake warning: products page
**File:** `src/app/(admin)/admin/products/page.tsx`
**Depends on:** (none)
- Add active sweepstake query per SPEC §16.6
- Render amber warning banner when no active sweepstake
- Warning is non-dismissable
- Verify: banner appears when no active sweepstake; hidden when one exists

---

## [DEVOPS]

### D1 — Apply new migration
- Run `supabase db push` or `supabase migration up` to apply `20240101000017_refresh_entry_verification_fn.sql`
- Verify: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'refresh_entry_verification'` returns a row

### D2 — Verify Upstash env vars in Vercel
- Confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set in Vercel project environment variables (Production + Preview)
- If not set: document that rate limiting will be skipped (this is expected and acceptable per spec)
- No deployment change required — code gracefully skips rate limiting when vars absent

### D3 — Confirm Resend configuration
- Verify `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set in Vercel environment
- Domain verification for `omniincubator.org` is an external task (E9/E18) — if not done, confirmation emails will fail gracefully (logged, not thrown)
- No deployment change required

### D4 — Run full build verification
- `npm run build` — must pass with 0 errors
- `npx tsc --noEmit` — must pass with 0 type errors
- `npm test` — must pass with all Vitest tests green
- `npm run lint` — must pass
- Document any warnings that are pre-existing and acceptable
