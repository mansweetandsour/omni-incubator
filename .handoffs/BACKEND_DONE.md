# BACKEND_DONE.md — Phase 4B: Sample Products & Admin Tools
**Backend Agent Output**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools
**Status:** COMPLETE

---

## Verification Results

- `npx tsc --noEmit` — **0 errors**

---

## Files Created

| File | Description |
|---|---|
| `supabase/migrations/20240101000018_export_sweepstake_entries_fn.sql` | Postgres RPC `export_sweepstake_entries(p_sweepstake_id UUID)` — joins `entry_verification` with `profiles`, returns 10 CSV columns, SECURITY DEFINER |
| `src/app/actions/sample-products.ts` | Server actions: `createSampleProduct`, `updateSampleProduct`, `toggleSampleProductActive` |
| `src/app/actions/admin-users.ts` | Server action: `adjustUserEntries` |
| `src/app/api/admin/sample-products/[id]/upload/route.ts` | POST — admin multipart upload; `type=pdf` → `sample-products` bucket, `type=cover` → `covers` bucket |
| `src/app/api/sample-products/[slug]/download/route.ts` | GET — token-based public download: validates token, confirmed_at, product match; 307 redirect to 1hr signed URL |
| `src/app/api/admin/sweepstakes/[id]/export/route.ts` | GET — admin CSV export; refreshes materialized view, calls RPC, returns `text/csv` with attachment header |

---

## Files Modified

| File | Change |
|---|---|
| `src/app/actions/sweepstakes.ts` | Fixed all `revalidateTag` calls (5 occurrences) to required two-argument form for Next.js 16 |
| `src/app/(admin)/admin/sweepstakes/actions.ts` | Fixed all `revalidateTag` calls (6 occurrences) to required two-argument form for Next.js 16 |
| `src/app/globals.css` | Added `.prose` and `.prose-invert` utility styles in `@layer utilities` block |

---

## Endpoints Implemented

| Method | Path | Description |
|---|---|---|
| POST | `/api/admin/sample-products/[id]/upload` | Admin only. `type=pdf`: validates PDF MIME + 100MB limit, uploads to `sample-products/{id}/{file}`, updates `sample_products.file_path`. `type=cover`: validates image MIME + 20MB limit, uploads to `covers/sample-products/{id}/cover-{base}.{ext}`, updates `cover_image_url`. Returns 400/401/403/413/415/500 on failures. |
| GET | `/api/sample-products/[slug]/download` | Public. Requires `?token=`. Steps: 400 no token → 404 token not found → 403 unconfirmed → 404 product not found → 403 mismatch → createSignedUrl(1hr) → 307 redirect. |
| GET | `/api/admin/sweepstakes/[id]/export` | Admin only. Calls `refresh_entry_verification` RPC (awaited), then `export_sweepstake_entries` RPC. Returns CSV with header `user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents`. |

---

## Server Actions Implemented

| Action | File | Behavior |
|---|---|---|
| `createSampleProduct(formData)` | `actions/sample-products.ts` | Validates title (required) + slug (required, `/^[a-z0-9-]+$/`), checks uniqueness, inserts with `file_path=''`, redirects to `/admin/sample-products` |
| `updateSampleProduct(id, formData)` | `actions/sample-products.ts` | Same validation, uniqueness check excludes self, updates all fields, `revalidatePath('/admin/sample-products')` |
| `toggleSampleProductActive(id, isActive)` | `actions/sample-products.ts` | Flips `is_active`, `revalidatePath('/admin/sample-products')` |
| `adjustUserEntries(userId, sweepstakeId, entries, notes)` | `actions/admin-users.ts` | Validates: non-zero entries, non-empty notes, UUID sweepstakeId. Inserts `sweepstake_entries` with `source='admin_adjustment'`. Calls `refreshEntryVerification()`. `revalidatePath('/admin/users/'+userId)`. Returns `{ success: true }` or `{ error: string }`. |

---

## Spec Deviations

### 1. revalidateTag: Two-argument form kept (not changed to single-argument)

**Spec said:** Fix `revalidateTag('tag', {})` → `revalidateTag('tag')` (single argument, stable Next.js 14 API).

**What was done:** This project runs **Next.js 16.2.3** where the type signature is `revalidateTag(tag: string, profile: string | CacheLifeConfig)` — the second argument is **required**. Removing it causes TypeScript error TS2554.

The "fix" was therefore to ensure all calls pass a valid second argument. The original `{}` is a valid `CacheLifeConfig` (all fields optional). All files now pass `tsc --noEmit` cleanly. The `{}` argument triggers immediate invalidation with default cache profile semantics, which is the intended behavior.

---

## Migration Instructions

```bash
# Apply migration
supabase db push

# Verify function was created
SELECT routine_name FROM information_schema.routines WHERE routine_name = 'export_sweepstake_entries';
```

---

## Notes for Frontend Agent

- `createSampleProduct` calls `redirect()` on success — this throws internally (Next.js pattern); do not try/catch the redirect itself.
- `adjustUserEntries` returns `{ success: true }` on success or `{ error: string }` on validation/DB failure.
- Download API (`/api/sample-products/[slug]/download?token=...`) issues a 307 redirect — use `<a href=...>` links, not `fetch()`.
- Export endpoint (`/api/admin/sweepstakes/[id]/export`) triggers a file download — link via `<a href=...>` or `window.location.href`.
- The `sample-products` bucket is **private** — never use `getPublicUrl()` for it; always use `createSignedUrl()`.
