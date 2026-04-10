# BACKEND_DONE.md — Phase 2: Products & Library

**Status:** DONE
**Date:** 2026-04-09

---

## Summary

All [BACKEND] tasks B1–B9 have been implemented. TypeScript (`tsc --noEmit`) passes with 0 errors. ESLint passes with 0 errors. No migrations required (Phase 2 adds no schema changes).

---

## Files Created or Modified

### New Files

| File | Task | Description |
|---|---|---|
| `src/lib/utils/slugify.ts` | B2 | Slug generation utility — lowercase, replace non-alphanumeric with `-`, collapse/trim |
| `src/lib/utils/product-labels.ts` | B3 | `CATEGORY_LABELS`, `OPERATOR_LABELS`, `SCALE_LABELS`, `COST_LABELS` display maps |
| `src/lib/stripe.ts` | B4 | Stripe singleton + `syncStripeProduct` + `syncStripeNewPrices` helpers (server-only) |
| `src/app/actions/products.ts` | B5 | Server Actions: `createProduct`, `updateProduct`, `archiveProduct` |
| `src/app/actions/services.ts` | B6 | Server Actions: `createService`, `updateService`, `archiveService` |
| `src/app/api/admin/ebooks/[id]/upload/route.ts` | B7 | POST multipart upload for ebook main PDF, preview PDF, cover image |
| `src/app/api/ebooks/[id]/preview/route.ts` | B8 | GET public preview — 307 redirect to CDN URL |
| `src/app/api/library/products/route.ts` | B9 | GET paginated + filtered product listing for library Load More |

### Modified Files

| File | Change |
|---|---|
| `package.json` | Added `react-markdown@^10.1.0` and `remark-gfm@^4.0.1` (B1) |

---

## API Endpoints Implemented

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/ebooks/[id]/upload` | Admin only (cookie auth + profiles.role='admin') | Multipart upload for `type=main` (PDF → `ebooks` private bucket), `type=preview` (PDF → `ebook-previews` public bucket), or `type=cover` (image → `covers` public bucket). MIME validation and 100MB size limit enforced. Updates DB after upload. Returns `{ path, url? }`. |
| GET | `/api/ebooks/[id]/preview` | None (public) | Looks up `ebooks.preview_file_path` by `product_id`. Returns 404 if no row or no preview. Otherwise issues 307 redirect to public CDN URL. |
| GET | `/api/library/products` | None (public) | Paginated product listing. Params: `page`, `q`, `category`, `operator_dependency`, `scale_potential`, `cost_to_start`, `sort`. Page size 12. Returns `{ products: ProductCard[], hasMore, total }`. |

---

## Server Actions

| Action | Returns on success | Returns on failure |
|---|---|---|
| `createProduct(formData)` | `{ id: string, slug: string }` | `{ error: string }` |
| `updateProduct(id, formData)` | `{ ok: true, priceChanged: boolean }` | `{ error: string }` |
| `archiveProduct(id)` | `{ ok: true }` | `{ error: string }` |
| `createService(formData)` | `{ id: string, slug: string }` | `{ error: string }` |
| `updateService(id, formData)` | `{ ok: true }` | `{ error: string }` |
| `archiveService(id)` | `{ ok: true }` | `{ error: string }` |

---

## How to Run Locally

No changes to dev server setup:

```bash
npm run dev   # starts on http://localhost:3000
```

`STRIPE_SECRET_KEY` is optional — Stripe sync skips silently if absent.

---

## Spec Deviations

### 1. Stripe apiVersion updated from `2024-06-20` to `2026-03-25.dahlia`
SPEC §8 specified `apiVersion: '2024-06-20'` but `stripe@22.0.1` (installed) only accepts `'2026-03-25.dahlia'` as the latest API version. Using the older string caused `tsc` to error with `Type '"2024-06-20"' is not assignable to type '"2026-03-25.dahlia"'`. Updated to the current version required by the installed SDK.

### 2. Tags search and `total` count accuracy
Per SPEC §11: tags filtering is done in JS after the DB query. The `total` count returned in the API response reflects the DB-filtered count (title + description ILIKE), not the JS-filtered count (which also checks tags). At Phase 2 scale this is acceptable and matches the SPEC's documented approach. A Supabase RPC with raw SQL would be needed for exact counts.

### 3. Admin auth helper uses discriminated union
The `getAdminUser()` helper returns `{ ok: false, error: string } | { ok: true, userId: string }` for clean TypeScript narrowing. Functionally equivalent to the SPEC pattern.

---

## Verification Results

```
node_modules/typescript/bin/tsc --noEmit   → 0 errors
node_modules/eslint/bin/eslint.js src/     → 0 errors
```

---

## Post-QA Fixes

**Date:** 2026-04-09

### DEFECT-1 Fixed — `src/lib/stripe.ts`: Eager singleton → lazy factory

**Problem:** `new Stripe(process.env.STRIPE_SECRET_KEY!, ...)` was called at module evaluation time. When `STRIPE_SECRET_KEY` is absent the Stripe SDK throws immediately, before any guard code runs.

**Fix:** Removed the top-level `stripe` export. Introduced a private `_stripe` variable and a `getStripe(): Stripe | null` function that returns `null` when the key is absent and lazily constructs the singleton on first call when the key is present. Both `syncStripeProduct` and `syncStripeNewPrices` now call `getStripe()` and early-return if the result is `null`, replacing the previous `if (!process.env.STRIPE_SECRET_KEY) return` guards.

### DEFECT-2 Fixed — `src/app/api/admin/ebooks/[id]/upload/route.ts`: Double extension on cover storage path

**Problem:** The cover storage path was constructed as `` `covers/${productId}/cover-${filename}.${ext}` `` where `filename` already contained the extension (e.g. `photo.jpg`), producing `cover-photo.jpg.jpg`.

**Fix:** Added `const baseName = filename.replace(/\.[^.]+$/, '')` to strip the existing extension before constructing the path, yielding the correct `cover-photo.jpg`.

### Post-fix verification

```
node_modules/typescript/bin/tsc --noEmit   → 0 errors
```

Build attempt with dummy env vars compiled successfully (Turbopack: ✓ Compiled successfully in 4.8s, TypeScript: Finished). The subsequent `collect page data` step errored on `supabaseKey is required` — this is a pre-existing env bootstrapping issue at build time (admin Supabase client requires `SUPABASE_SERVICE_ROLE_KEY` at static generation), unrelated to either defect fixed in this patch.
