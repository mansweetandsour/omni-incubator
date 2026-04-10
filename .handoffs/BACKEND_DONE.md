# BACKEND_DONE.md — Phase 4A: Sweepstakes Core
**Backend Agent Output**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core
**Status:** COMPLETE

---

## Verification Results

- `npx tsc --noEmit` — **0 errors**
- `npx vitest run` — **7/7 tests pass**
- `npm run build` — Pre-existing build failures in non-Phase-4A routes (see Spec Deviations #3). All Phase 4A routes compile cleanly.

---

## Files Created

### Migration
- `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql` — `public.refresh_entry_verification()` PLPGSQL SECURITY DEFINER wrapper for REFRESH MATERIALIZED VIEW CONCURRENTLY

### Vitest
- `vitest.config.ts` — Project root config with `@` alias and `node` environment

### Entry Engine
- `src/lib/sweepstakes.ts` — `calculateEntries`, `computeLeadCaptureEntries`, `awardPurchaseEntries`, `awardLeadCaptureEntries`, `refreshEntryVerification` (debounced 60s), `getActiveSweepstake`, `fetchActiveMultiplierMax`, `fetchCoupon`

### Tests
- `src/lib/__tests__/sweepstakes.test.ts` — 7 unit tests (5x calculateEntries, 2x computeLeadCaptureEntries)

### Email Templates
- `src/emails/lead-capture-confirm.tsx` — `LeadCaptureConfirmEmail` (confirmUrl, sweepstakeTitle, prizeDescription)
- `src/emails/sample-product-confirm.tsx` — `SampleProductConfirmEmail` (confirmUrl, productTitle)

### API Routes
- `src/app/api/lead-capture/route.ts` — POST /api/lead-capture
- `src/app/api/lead-capture/confirm/route.ts` — POST /api/lead-capture/confirm
- `src/app/api/lead-capture/resend/route.ts` — POST /api/lead-capture/resend

### Admin Server Actions
- `src/app/(admin)/admin/sweepstakes/actions.ts` — activate/end/create/updateSweepstake, upsertMultiplier, toggleMultiplier, create/update/toggleCoupon
- `src/app/actions/sweepstakes.ts` — Duplicate per SPEC §B10 task assignment

### Admin Pages
- `src/app/(admin)/admin/sweepstakes/new/page.tsx` — New sweepstake form page
- `src/app/(admin)/admin/sweepstakes/[id]/page.tsx` — Edit sweepstake form page
- `src/app/(admin)/admin/sweepstakes/[id]/multipliers/page.tsx` — Multipliers management page
- `src/app/(admin)/admin/coupons/new/page.tsx` — New coupon form page
- `src/app/(admin)/admin/coupons/[id]/page.tsx` — Edit coupon form page

### Admin Client Components
- `src/components/admin/sweepstake-actions.tsx` — Activate/End buttons with toast error on conflict
- `src/components/admin/sweepstake-form.tsx` — Sweepstake create/edit form (all SPEC §16.2 fields)
- `src/components/admin/multiplier-manager.tsx` — Multiplier list + upsert + toggle (overlap warning)
- `src/components/admin/coupon-form.tsx` — Coupon create/edit (code uppercased on blur; disabled in edit)
- `src/components/admin/coupon-toggle.tsx` — Active/Inactive toggle for coupons list

---

## Files Modified

| File | Change |
|---|---|
| `package.json` | Added vitest + @vitest/coverage-v8 devDeps, test/test:watch scripts |
| `src/app/api/webhooks/stripe/route.ts` | Added awardPurchaseEntries import; fixed 3x order_items inserts to capture IDs; replaced 3x TODO stubs with actual entry awarding (try/catch — non-fatal) |
| `src/app/api/auth/callback/route.ts` | Added lazy admin client + fire-and-forget sweepstake_entries lead linking; added `dynamic = 'force-dynamic'` |
| `src/lib/email.tsx` | Added lead_capture_confirm + sample_product_confirm to TemplateKey, SUBJECTS, and switch statement |
| `src/app/(admin)/admin/sweepstakes/page.tsx` | Replaced placeholder with full list page (status badges, activate/end actions) |
| `src/app/(admin)/admin/coupons/page.tsx` | Replaced placeholder with full list page (all columns, toggle, edit link) |
| `src/app/(admin)/admin/products/page.tsx` | Added no-active-sweepstake amber warning banner |
| `src/app/library/page.tsx` | Added adminClient import + sweepData fetch + custom_entry_amount in select + sweepData passed to ProductCard |
| `src/components/library/product-card.tsx` | Added sweepData + custom_entry_amount optional props; dynamic entry badge replaces static "Earn entries" |

---

## Endpoints Implemented

| Method | Path | Description |
|---|---|---|
| POST | `/api/lead-capture` | Create lead capture, send confirmation email. Rate: 5/IP/hr via Upstash. Skips rate limit if Upstash not configured. |
| POST | `/api/lead-capture/confirm` | Validate token (72h TTL), mark confirmed, award sweepstake entries, return active multiplier info |
| POST | `/api/lead-capture/resend` | Regenerate token + resend email. Rate: 1/5min per email. DB-level guard as fallback. |

---

## Spec Deviations

### 1. `revalidateTag` requires 2 arguments in Next.js 16
Next.js 16.2.3 type signature: `revalidateTag(tag: string, profile: string | CacheLifeConfig)`. SPEC specifies single-arg calls. All calls use `revalidateTag('...', {})` which triggers immediate tag invalidation.

### 2. Auth callback lazy admin client initialization
The SPEC specified `import { adminClient } from '@/lib/supabase/admin'` at module level, but this caused build failure in Next.js 16 which evaluates server route modules at build time without env vars. Changed to `getAdminClient()` function that initializes lazily inside the request handler. Functionally identical at runtime.

### 3. Pre-existing build failures unrelated to Phase 4A
`npm run build` fails on pre-existing routes (`/api/checkout/ebook`, `/api/ebooks/[id]/preview`, and others from Phase 3) that import `adminClient` as a module-level singleton without `export const dynamic = 'force-dynamic'`. These failures existed in Phase 3 code and are not caused by Phase 4A. All Phase 4A routes have `export const dynamic = 'force-dynamic'` and pass `npx tsc --noEmit` cleanly.

### 4. Test file mock for adminClient
The sweepstakes test file uses `vi.mock('@/lib/supabase/admin', ...)` to prevent module-level `createClient()` from failing without env vars. Only pure functions are tested — consistent with SPEC intent.

---

## Post-QA Fixes

**QA defect resolved — 2026-04-09**

- **File:** `src/app/api/webhooks/stripe/route.ts`
- **Change:** Removed residual stub comment `// TODO Phase 4A: award sweepstake entries (combined checkout — entries_awarded_by_checkout=true)` at line 341 (inside the `checkout.session.completed` → `subscription` mode branch, after the subscription upsert block). The actual `awardPurchaseEntries()` call was already correctly implemented earlier in the same branch (lines 291–309); only the orphaned comment was removed.
- **Verification:** `tsc --noEmit` — 0 errors; `vitest run` — 7/7 tests pass.

---

## Running Tests

```bash
npm test           # vitest run
npm run test:watch # vitest watch
```

## Database Migration

```bash
supabase db push
# Verify:
# SELECT routine_name FROM information_schema.routines WHERE routine_name = 'refresh_entry_verification';
```
