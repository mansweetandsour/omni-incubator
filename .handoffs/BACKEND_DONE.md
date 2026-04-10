# BACKEND_DONE.md — Phase 5: Marketplace Shell
**Backend Agent Output**
**Date:** 2026-04-09
**Phase:** 5 — Marketplace Shell
**Status:** COMPLETE

---

## TypeScript Check

`node node_modules/typescript/bin/tsc --noEmit` — **0 errors**

---

## Files Created

| File | Description |
|---|---|
| `supabase/migrations/20240101000019_services_custom_entry_amount.sql` | Additive migration: `ALTER TABLE public.services ADD COLUMN IF NOT EXISTS custom_entry_amount INTEGER` |

## Files Modified

| File | Changes |
|---|---|
| `src/app/actions/services.ts` | Added `revalidatePath` import; extended `updateService` with `custom_entry_amount` handling + revalidation; added `approveService` export |

---

## Actions Implemented

| Action | File | Description |
|---|---|---|
| `updateService` (extended) | `src/app/actions/services.ts` | Reads `custom_entry_amount` from FormData; validates ≥1 if provided; writes to DB; revalidates `/admin/services` and `/marketplace` |
| `approveService` (new) | `src/app/actions/services.ts` | Admin auth guard; sets `status='approved'` on service by id; revalidates `/admin/services` |

---

## Spec Deviations

None. All tasks B1, B2, B3 implemented exactly per SPEC.md and TASKS.md.
