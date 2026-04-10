# QA_REPORT.md — Phase 4B: Sample Products & Admin Tools
**QA Agent Output**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools

---

**Overall result: PASS**

---

## Test Run Summary

| Suite | Total | Passed | Failed |
|---|---|---|---|
| Vitest unit tests | 7 | 7 | 0 |
| TypeScript (`tsc --noEmit`) | — | 0 errors | — |
| Next.js production build | 63+ routes | All compiled | 0 |

### TypeScript
`node node_modules/typescript/bin/tsc --noEmit` — **0 errors**

### Vitest
`node node_modules/vitest/vitest.mjs run` — **7/7 tests passed**
- `src/lib/__tests__/sweepstakes.test.ts` — 7 tests, all green, no regressions from Phase 4A

### Next.js Build
`NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co ... next build` — **PASS**
"Compiled successfully in 6.2s". All Phase 4B routes compiled:
`/free/[slug]`, `/free/[slug]/download`, `/api/sample-products/[slug]/download`, `/api/admin/sweepstakes/[id]/export`, `/admin/users`, `/admin/users/[id]`, `/profile/entries`, `/sweepstakes`, `/sweepstakes/rules`

---

## Acceptance Criteria Validation

### AC 1 — `sample_products` table contains all required columns
**PASS** — `supabase/migrations/20240101000007_lead_captures_samples.sql` confirmed by PRD agent to contain all required columns. No migration needed and none created for this purpose.

### AC 2 — Admin can create a sample product with all fields, PDF upload to `sample-products` bucket, cover upload to `covers` bucket
**PASS** — `src/app/actions/sample-products.ts` implements `createSampleProduct(formData)`. `src/app/api/admin/sample-products/[id]/upload/route.ts` implements POST with `type=pdf` → `sample-products` bucket and `type=cover` → `covers` bucket, with MIME validation and size limits.

### AC 3 — Admin can edit a sample product and toggle active status
**PASS** — `updateSampleProduct(id, formData)` and `toggleSampleProductActive(id, isActive)` in `actions/sample-products.ts`. Toggle flips `is_active` and calls `revalidatePath`.

### AC 4 — `/admin/sample-products` list shows capture count, confirmed count, and confirmation rate per product
**PASS** — `src/app/(admin)/admin/sample-products/page.tsx` replaced with full implementation; renders table with lead capture stats, toggle, edit/view links per FRONTEND_DONE.md.

### AC 5 — `/free/[slug]` renders for `is_active = true`; returns 404 for `is_active = false` or unknown slug
**PASS** — `src/app/free/[slug]/page.tsx` line 62: queries `WHERE slug = $slug AND is_active = true`, calls `notFound()` if no row returned. Both inactive and unknown slug handled identically.

### AC 6 — `/free/[slug]` capture form POSTs to `/api/lead-capture` with `source: 'sample_product'` and `sampleProductId`
**PASS** — `src/components/free/LeadCaptureFormFree.tsx` lines 24–29: POSTs `{ email, source: 'sample_product', sampleProductId: productId }`. The `productId` prop is `product.id`. Phone conditionally included per `requirePhone`.

### AC 7 — `/free/[slug]` shows phone field only when `require_phone = true`
**PASS** — `LeadCaptureFormFree.tsx` lines 109–124: renders phone input block only when `requirePhone` prop is true.

### AC 8 — `/free/[slug]` entry callout shows `custom_entry_amount` if set, else `sweepstake.non_purchase_entry_amount`; callout absent when no active sweepstake
**PASS** — `page.tsx` line 87–89: `entryCount = product.custom_entry_amount ?? sweepstake?.non_purchase_entry_amount ?? null`. Lines 111–115: callout rendered only when `entryCount !== null && sweepstake`.

### AC 9 — `/free/[slug]/download?token={confirmed_token}` renders download button, entry count, and upsell section
**PASS** — `src/app/free/[slug]/download/page.tsx`: renders download `<a>` tag (line 136) pointing to `/api/sample-products/${slug}/download?token=${token}`. Entry count displayed (lines 128–133). Upsell section rendered when `upsellProduct || product.upsell_membership`.

### AC 10 — `/free/[slug]/download?token={unconfirmed_token}` redirects to `/confirm/{token}`
**PASS** — `download/page.tsx` lines 36–38: `if (!lead.confirmed_at) { redirect('/confirm/${token}') }`. Server-side redirect.

### AC 11 — `/free/[slug]/download` with no token redirects to `/free/{slug}`
**PASS** — `download/page.tsx` lines 20–22: `if (!token) { redirect('/free/${slug}') }`.

### AC 12 — `/free/[slug]/download` with confirmed token for a different product's lead capture redirects to `/free/{slug}` (token/product mismatch)
**PASS** — `download/page.tsx` lines 52–54: `if (lead.sample_product_id !== product.id) { redirect('/free/${slug}') }`.

### AC 13 — `GET /api/sample-products/[slug]/download?token={confirmed_token}` returns 307 redirect to Supabase signed URL (1hr expiry)
**PASS** — `src/app/api/sample-products/[slug]/download/route.ts` lines 50–60: calls `adminClient.storage.from('sample-products').createSignedUrl(product.file_path, 3600)` then returns `NextResponse.redirect(signedUrl.signedUrl, { status: 307 })`.

### AC 14 — `GET /api/sample-products/[slug]/download?token={unconfirmed_token}` returns 403
**PASS** — `route.ts` lines 27–29: `if (!lead.confirmed_at) { return NextResponse.json({ error: 'Not confirmed' }, { status: 403 }) }`.

### AC 15 — `GET /api/sample-products/[slug]/download` with no token returns 400
**PASS** — `route.ts` lines 12–14: `if (!token) { return NextResponse.json({ error: 'Token required' }, { status: 400 }) }`.

### AC 16 — `/admin/users` search by email returns matching results; search by order_number returns matching user
**PASS** — `src/app/(admin)/admin/users/page.tsx`: ILIKE search on email/phone/display_name/username (lines 70–75). Separate order_number exact-match query (lines 78–82) merged and deduplicated by id (lines 98–106). Default shows 20 most recent users.

### AC 17 — `/admin/users/[id]` shows profile, subscription, orders, e-books, entry breakdown, and entry history
**PASS** — `src/app/(admin)/admin/users/[id]/page.tsx`: 7 parallel fetches. All sections present: Profile, Subscription, Orders, E-books, Entry Breakdown (from `entry_verification`), Entry History (from `sweepstake_entries` last 50), Entry Adjustment Form.

### AC 18 — Admin entry adjustment with positive entries creates `sweepstake_entries` row with `source = 'admin_adjustment'` and `total_entries > 0`
**PASS** — `src/app/actions/admin-users.ts` lines 17–30: inserts row with `source: 'admin_adjustment'` and `total_entries: entries` (positive input value). `base_entries` also set to input.

### AC 19 — Admin entry adjustment with negative entries creates `sweepstake_entries` row with `total_entries < 0`
**PASS** — `admin-users.ts` line 13: only rejects `entries === 0`. Negative integers pass validation. `base_entries: entries` and `total_entries: entries` insert the negative value directly.

### AC 20 — Admin entry adjustment with empty notes is rejected (validation error)
**PASS** — `admin-users.ts` line 14: `if (!notes || notes.trim().length === 0) return { error: 'Notes are required' }`. Client also validates (form component lines 41–43).

### AC 21 — Admin entry adjustment with `entries = 0` is rejected (validation error)
**PASS** — `admin-users.ts` line 13: `if (entries === 0) return { error: 'Entries must be non-zero' }`. Client also validates (form component lines 37–39).

### AC 22 — `GET /api/admin/sweepstakes/[id]/export` returns CSV with correct header row
**PASS** — `src/app/api/admin/sweepstakes/[id]/export/route.ts` lines 55–56: header is exactly `user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents`. Column aliases implemented via `export_sweepstake_entries` RPC in `supabase/migrations/20240101000018_export_sweepstake_entries_fn.sql`.

### AC 23 — CSV export calls `refresh_entry_verification` RPC before querying
**PASS** — `route.ts` line 43: `await adminClient.rpc('refresh_entry_verification')` — awaited before data query on line 46. Ensures fresh materialized view.

### AC 24 — `GET /api/admin/sweepstakes/[id]/export` with non-admin session returns 403
**PASS** — `route.ts` lines 20–38: authenticates via `createClient().auth.getUser()`, then checks `profiles.role`. Returns 401 if no user, 403 if `role !== 'admin'`.

### AC 25 — `/profile/entries` (authenticated, active sweepstake) shows `total_entries` and source breakdown
**PASS** — `src/app/profile/entries/page.tsx`: `export const dynamic = 'force-dynamic'`. Auth check via `createClient().auth.getUser()`. Fetches `entry_verification` for active sweepstake. Displays `total_entries` in large number and breakdown cards: purchase, non-purchase, admin, coupon bonus.

### AC 26 — `/profile/entries` (authenticated, no active sweepstake) shows "No active sweepstake right now"
**PASS** — `entries/page.tsx` lines 44–80: when `!activeSweepstake`, renders "No active sweepstake right now" with "Check back soon!" message.

### AC 27 — `/sweepstakes` renders hero with prize and countdown; "Ways to enter" section lists active sample products
**PASS** — `src/app/sweepstakes/page.tsx`: `export const revalidate = 60`. Hero (lines 72–107) shows prize amount and `<CountdownTimer>`. "Free Resources (Earn Entries)" section (lines 139–157) lists active sample products with `/free/{slug}` links and entry count.

### AC 28 — `/sweepstakes` with no active sweepstake renders "coming soon" message only
**PASS** — `sweepstakes/page.tsx` lines 51–63: `if (!activeSweepstake)` renders "Our next sweepstake is coming soon — check back soon!" only.

### AC 29 — `/sweepstakes/rules` renders static legal content with `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}` visible
**PASS** — `src/app/sweepstakes/rules/page.tsx` lines 17–19: placeholder string rendered verbatim in amber banner. All 9 legal sections present (No Purchase Necessary, How to Enter, Eligibility, Prize Description, Odds of Winning, Drawing Method, Winner Notification, Claiming the Prize, Sponsor). No data fetching — static page.

### AC 30 — `/admin` dashboard renders stats cards (member count, revenue, sweepstake summary, lead capture stats)
**PASS** — `src/app/(admin)/admin/page.tsx`: 4 stat cards rendered — "Active Members", "Revenue This Month", "Active Sweepstake" (title + days remaining + entry count), "Lead Captures" (total + confirmed count). No longer a redirect stub.

### AC 31 — `/admin` dashboard shows amber warning banner when no active sweepstake
**PASS** — `admin/page.tsx` lines 112–116: `{!activeSweepstake && (<div ... amber styles ...>⚠️ No active sweepstake — purchases are not earning entries.</div>)}`. Non-dismissable.

### AC 32 — `/admin` dashboard shows recent orders table
**PASS** — `admin/page.tsx` lines 174–228: recent orders table shows order number, customer email (via `profiles!inner(email)` join), amount formatted, status badge, date. Last 10 orders DESC.

### AC 33 — `npm run build` passes with no errors
**PASS** — `next build` completed successfully: "Compiled successfully in 6.2s", 0 errors.

### AC 34 — `npx tsc --noEmit` passes with 0 errors
**PASS** — `node node_modules/typescript/bin/tsc --noEmit` produced no output (0 errors).

---

## Summary

**34 PASS / 0 FAIL**

No regressions in existing tests (7/7 Vitest tests green from Phase 4A).

---

## Advisory Findings (Non-blocking)

### Advisory 1 — Admin dashboard lead capture stat uses all-time counts, not spec-exact time windows
**Severity: Low**
R11 specifies "Pending lead confirmations: `WHERE confirmed_at IS NULL AND created_at > now() - interval '7 days'`" and "Confirmed today: `WHERE confirmed_at >= date_trunc('day', now())`". The dashboard queries total all-time leads and all-time confirmed leads instead. AC #30 only requires "lead capture stats" be present — satisfied. The time-window filtering is not enforced by any AC. Recommend follow-up task if exact semantics are required.

### Advisory 2 — `revalidateTag` two-argument form kept for Next.js 16
**Severity: Low**
BACKEND_DONE.md documents that `revalidateTag` is kept in two-argument form because the project runs Next.js 16.2.3 where the second argument is required per TypeScript types. Build and tsc pass with 0 errors. This is technically correct for the installed Next.js version.

---

*End of QA_REPORT.md — Phase 4B*
