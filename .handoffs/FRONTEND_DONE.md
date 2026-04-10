# FRONTEND_DONE.md — Phase 5: Marketplace Shell
**Frontend Agent Output**
**Date:** 2026-04-09
**Phase:** 5 — Marketplace Shell
**Status:** COMPLETE

---

## Build Status

- `node node_modules/typescript/bin/tsc --noEmit` — **0 errors**
- `next build` — **exits 0**, 37 pages generated, no errors or warnings
- `/marketplace/[slug]` route confirmed in build output

---

## Files Created

| File | Description |
|---|---|
| `src/components/marketplace/ServiceApproveButton.tsx` | Client component — calls `approveService` Server Action via `useTransition`; shows loading state; success/error toast via sonner |
| `src/components/marketplace/ServiceWaitlistCTA.tsx` | Client component — toggles inline `LeadCaptureForm` on button click; source=`marketplace_coming_soon` |
| `src/app/marketplace/[slug]/page.tsx` | Public service detail page — ISR 60s; status gate (404 for pending/suspended/deleted); rate display with all rate types; Markdown `long_description` in `.prose` wrapper; provider info from profiles join; entry badge with Suspense; Coming Soon overlay with `ServiceWaitlistCTA`; `generateMetadata` |

## Files Modified

| File | Changes |
|---|---|
| `src/components/admin/service-form.tsx` | Added `custom_entry_amount: number \| null` to Service interface; fixed rate type options (project→fixed, retainer→monthly); added `custom_entry_amount` number input; fixed status dropdown options (added approved/suspended, removed paused); added color status badge |
| `src/components/admin/service-table.tsx` | Fixed `formatRate()` with correct rate type suffixes (hr/fixed/mo); added `ServiceApproveButton` import and rendered on pending non-archived rows |
| `src/app/(admin)/admin/services/page.tsx` | Full rewrite: added `searchParams` prop; status filter links (All/Pending Approval/Active); conditional query filtering per status param |
| `src/app/(admin)/admin/services/[id]/edit/page.tsx` | Added `custom_entry_amount` to Supabase select query to satisfy updated `Service` interface |
| `src/app/marketplace/page.tsx` | Full rewrite: added `custom_entry_amount` + `slug` to query; added `status IN (active, approved)` filter; entry badge with Suspense on cards; cards wrapped with `<Link>` to detail page |

---

## Pages / Routes Implemented

| Route | Type | Description |
|---|---|---|
| `/marketplace/[slug]` | NEW — ISR 60s | Service detail page |
| `/marketplace` | MODIFIED | Cards link to detail; entry badges; only active/approved visible |
| `/admin/services` | MODIFIED | Status filter UI; Approve quick-action button |
| `/admin/services/[id]/edit` | MODIFIED | `custom_entry_amount` fetched and editable |

---

## Spec Deviations

None. All F1–F7 tasks implemented exactly per SPEC.md and TASKS.md. The edit page query modification (adding `custom_entry_amount` to the select) was necessary to satisfy the updated `Service` interface TypeScript type and is consistent with the SPEC's intent.
