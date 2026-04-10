# TASKS.md — Phase 4B: Sample Products & Admin Tools
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools

All tasks are ordered by dependency. Backend tasks must complete before Frontend tasks that depend on them. Tasks within the same section that have no inter-dependency can run in parallel.

---

## [BACKEND]

### B1 — Fix revalidateTag bug (F3) in sweepstakes actions
**Files:** `src/app/(admin)/admin/sweepstakes/actions.ts`, `src/app/actions/sweepstakes.ts`

In both files, find every call of the form `revalidateTag('...', {})` and change to `revalidateTag('...')` (single argument). There are 4 occurrences in the first file and 5 in the second file (see SPEC.md §7 for exact line numbers).

**Test:** `npx tsc --noEmit` must pass after this change (the two-argument form is a TypeScript error on `revalidateTag`).

---

### B2 — New migration: export_sweepstake_entries RPC function
**File:** `supabase/migrations/20240101000018_export_sweepstake_entries_fn.sql`

Create the SQL file with the `CREATE OR REPLACE FUNCTION public.export_sweepstake_entries(p_sweepstake_id UUID)` function as specified in SPEC.md §4. The function joins `entry_verification` with `profiles` and returns the 10 columns needed for CSV export with correct aliases.

**Test:** Apply migration locally with `supabase db push` or `supabase migration up`. Verify function exists: `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'export_sweepstake_entries'`.

---

### B3 — Server Actions: sample-products
**File:** `src/app/actions/sample-products.ts`

Implement three server actions as specified in SPEC.md §6:
1. `createSampleProduct(formData: FormData): Promise<{ error?: string }>` — validates title/slug, checks slug uniqueness, inserts row with `file_path = ''`, then `redirect('/admin/sample-products')`.
2. `updateSampleProduct(id: string, formData: FormData): Promise<{ error?: string }>` — updates all fields, validates slug uniqueness excluding self, calls `revalidatePath('/admin/sample-products')`.
3. `toggleSampleProductActive(id: string, isActive: boolean): Promise<{ error?: string }>` — flips `is_active`, calls `revalidatePath('/admin/sample-products')`.

All three use `adminClient`. The `'use server'` directive must be at the top of the file.

**Test:** TypeScript compiles. All three functions have correct return types.

---

### B4 — Server Action: adjustUserEntries
**File:** `src/app/actions/admin-users.ts`

Implement `adjustUserEntries(userId: string, sweepstakeId: string, entries: number, notes: string): Promise<{ success?: boolean; error?: string }>` as specified in SPEC.md §6.

Validation order: non-zero entries, non-empty notes, UUID format for sweepstakeId. Insert `sweepstake_entries` row with `source: 'admin_adjustment'`. Import and call `refreshEntryVerification()` from `@/lib/sweepstakes`. Call `revalidatePath('/admin/users/' + userId)`.

**Test:** TypeScript compiles. Import from `@/lib/sweepstakes` resolves correctly.

---

### B5 — API route: POST /api/admin/sample-products/[id]/upload
**File:** `src/app/api/admin/sample-products/[id]/upload/route.ts`

Implement as specified in SPEC.md §5. Admin auth check (same pattern as `src/app/api/admin/ebooks/[id]/upload/route.ts`). Handle `type === 'pdf'` (→ `sample-products` bucket, update `file_path`) and `type === 'cover'` (→ `covers` bucket with path prefix `covers/sample-products/`, update `cover_image_url`). Return 400/401/403/413/415/500 on failures.

**Test:** TypeScript compiles. Auth check returns 403 for non-admin. File size limit enforced.

---

### B6 — API route: GET /api/sample-products/[slug]/download
**File:** `src/app/api/sample-products/[slug]/download/route.ts`

Implement exactly as specified in SPEC.md §5 (8 steps). Uses `adminClient` only (no session). Token → lead_capture verification → confirmed_at check → product lookup → sample_product_id mismatch check → signed URL generation → 307 redirect.

**Test:** TypeScript compiles. 400 for missing token, 403 for unconfirmed, 307 + signed URL for confirmed+matching token.

---

### B7 — API route: GET /api/admin/sweepstakes/[id]/export
**File:** `src/app/api/admin/sweepstakes/[id]/export/route.ts`

Implement as specified in SPEC.md §5. Admin auth check. Await `adminClient.rpc('refresh_entry_verification')`. Call `adminClient.rpc('export_sweepstake_entries', { p_sweepstake_id: id })`. Build CSV string with escaping function. Return `new Response(csv, { headers: ... })`.

CSV escape helper (inline or exported):
```typescript
function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}
```

**Test:** TypeScript compiles. Returns `text/csv` content type. Header row matches exactly: `user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents`.

---

### B8 — Add .prose utility styles to globals.css
**File:** `src/app/globals.css`

Add the following at the end of the file inside an `@layer utilities` block. This provides basic prose styling for markdown content rendered on `/free/[slug]` and `/free/[slug]/download`:

```css
@layer utilities {
  .prose {
    color: inherit;
    line-height: 1.75;
  }
  .prose h1, .prose h2, .prose h3, .prose h4 {
    font-weight: 700;
    line-height: 1.25;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  .prose h1 { font-size: 1.875rem; }
  .prose h2 { font-size: 1.5rem; }
  .prose h3 { font-size: 1.25rem; }
  .prose h4 { font-size: 1.125rem; }
  .prose p { margin-top: 0.75em; margin-bottom: 0.75em; }
  .prose ul { list-style-type: disc; padding-left: 1.5em; margin-top: 0.75em; margin-bottom: 0.75em; }
  .prose ol { list-style-type: decimal; padding-left: 1.5em; margin-top: 0.75em; margin-bottom: 0.75em; }
  .prose li { margin-top: 0.25em; margin-bottom: 0.25em; }
  .prose a { color: #2563eb; text-decoration: underline; }
  .prose code { font-family: monospace; background: rgba(0,0,0,0.06); padding: 0.1em 0.3em; border-radius: 3px; font-size: 0.9em; }
  .prose blockquote { border-left: 4px solid #e4e4e7; padding-left: 1em; color: #71717a; font-style: italic; margin: 1em 0; }
  .dark .prose-invert a { color: #60a5fa; }
  .dark .prose-invert code { background: rgba(255,255,255,0.1); }
  .dark .prose-invert blockquote { border-left-color: #52525b; color: #a1a1aa; }
}
```

**Test:** Build passes. Prose styles apply on `/free/[slug]` when long_description has markdown content.

---

## [FRONTEND]

### F1 — Component: CountdownTimer
**File:** `src/components/sweepstakes/CountdownTimer.tsx`

Implement as specified in SPEC.md §8. Client component with `useState`/`useEffect`. Avoids hydration mismatch by initializing state to null and rendering `&nbsp;` until first client tick. Cleans up interval on unmount.

**Test:** Renders correctly with a future date. Shows "Sweepstake ended" for past dates. No hydration warnings in dev mode.

---

### F2 — Component: SampleProductFileUpload
**File:** `src/components/admin/sample-product-file-upload.tsx`

Copy and adapt `src/components/admin/file-upload-section.tsx`. Only change: the fetch URL is `/api/admin/sample-products/{productId}/upload` (not `/api/admin/ebooks/{productId}/upload`). Accept strings: `pdf` → `application/pdf`, `cover` → `image/jpeg,image/png,image/webp`. All other logic identical.

**Test:** TypeScript compiles. Component renders and POSTs to correct URL.

---

### F3 — Component: SampleProductForm
**File:** `src/components/admin/sample-product-form.tsx`

Implement as specified in SPEC.md §8. Must include:
- Slug auto-generation from title with `slugTouched` guard.
- `require_email` toggle rendered as disabled+checked.
- `custom_entry_amount` optional integer field with ≥1 client validation.
- `upsell_product_id` select dropdown (populated from `activeEbooks` prop). Empty option "— None —".
- `upsell_membership` toggle (default true on create, use current value on edit).
- All text fields: `title`, `slug`, `description` (textarea), `long_description` (textarea), `upsell_heading`, `upsell_body`.
- Submit calls `createSampleProduct` (new) or `updateSampleProduct(product.id, ...)` (edit) via `useTransition`.
- Error display via inline `<p className="text-sm text-red-500">` below submit button.

**Test:** TypeScript compiles. Create and Edit forms render with correct initial values.

---

### F4 — Component: LeadCaptureFormFree
**File:** `src/components/free/LeadCaptureFormFree.tsx`

Implement as specified in SPEC.md §8. Client component. 5-state machine (idle, loading, success, duplicate, error). POSTs to `/api/lead-capture`. Shows phone field only if `requirePhone === true`. Button text: "Get Free Access". Loading: disable button + show spinner text. On success or duplicate: replaces form with message. On error: shows inline error message, keeps form visible.

**Test:** TypeScript compiles. Renders with and without phone field.

---

### F5 — Component: UserEntryAdjustmentForm
**File:** `src/components/admin/user-entry-adjustment-form.tsx`

Implement as specified in SPEC.md §8. Select dropdown for sweepstake. Integer input for entries (no min attribute — negatives allowed). Textarea for notes. Calls `adjustUserEntries` server action. Shows inline validation errors. On success: `toast.success('Entry adjustment saved')` + reset form to defaults.

**Test:** TypeScript compiles. Import of server action resolves.

---

### F6 — Admin Dashboard page
**File:** `src/app/(admin)/admin/page.tsx`

Replace the redirect stub with a real server component as specified in SPEC.md §9. Parallel fetch of 5 data points. Render 4 stat cards, amber warning banner (conditional), recent orders table, link to sweepstake detail. Use existing `<Badge>` and table patterns from adjacent admin pages.

**Test:** Page renders without TypeScript errors. Build passes.

---

### F7 — Admin Sample Products list page
**File:** `src/app/(admin)/admin/sample-products/page.tsx`

Replace placeholder. Server component. Query with lead_capture aggregation as specified in SPEC.md §9. Table with columns: Title, Slug, Status badge, Total Captures, Confirmed, Rate, Actions (Edit link, View link with `target="_blank"`, Active toggle). "New Sample Product" button.

Toggle active: use a client-side button that calls `toggleSampleProductActive` action. Can be a small inline `<form>` with a hidden input or a dedicated toggle client component.

**Test:** Page renders. TypeScript compiles.

---

### F8 — Admin Sample Products new page
**File:** `src/app/(admin)/admin/sample-products/new/page.tsx`

Server component. Fetches active ebooks. Renders `<SampleProductForm activeEbooks={activeEbooks} />` (no product prop = create mode).

**Test:** Page renders. TypeScript compiles.

---

### F9 — Admin Sample Products edit page
**File:** `src/app/(admin)/admin/sample-products/[id]/edit/page.tsx`

Server component. `params: Promise<{ id: string }>`. Fetch product by id — notFound() if missing. Fetch active ebooks. Render `<SampleProductForm product={...} activeEbooks={...} />`. Below form: two `<SampleProductFileUpload>` sections (type='pdf', type='cover').

**Test:** Page renders for existing product. notFound() for unknown id.

---

### F10 — Admin Users search page
**File:** `src/app/(admin)/admin/users/page.tsx`

Replace placeholder. Server component as specified in SPEC.md §9. Search form with GET method. Default shows last 20 users. With `?q=`: ILIKE search + order_number exact match (two queries, merge, dedup). Table with role badge and subscription status badge. Row links to `/admin/users/[id]`.

**Test:** Page renders without `q`. TypeScript compiles.

---

### F11 — Admin User detail page
**File:** `src/app/(admin)/admin/users/[id]/page.tsx`

New server component. 7 data fetches in parallel. 7 sections rendered (Profile, Subscription, Orders, E-books, Entry Breakdown, Entry History, Adjustment Form). Entry history source labels. Notes shown only for admin_adjustment source. `<UserEntryAdjustmentForm>` at bottom with sweepstakes dropdown.

**Test:** Page renders for existing user. notFound() for unknown id. TypeScript compiles.

---

### F12 — Sample Product landing page
**File:** `src/app/free/[slug]/page.tsx`

New server component with `revalidate = 60`. 5 layout sections as specified in SPEC.md §9. notFound() for inactive/missing slugs. `generateMetadata()` export. `<CountdownTimer>` for sweepstake info block. `<LeadCaptureFormFree>` for capture form. ReactMarkdown for long_description. Upsell section renders linked ebook card and/or membership card.

**Test:** Page renders for active product. Returns 404 for inactive slug. TypeScript compiles. `generateMetadata` export is valid.

---

### F13 — Sample Product download page
**File:** `src/app/free/[slug]/download/page.tsx`

New server component with `force-dynamic`. Server-side redirects for all invalid/unconfirmed/mismatch cases. Download button is an `<a>` tag (not a client-side Button) linking to the download API. Entry count calculation falls back to product config if no entry row found. Upsell section same as landing page.

**Test:** Page renders for confirmed token. Server redirects work for missing token, unconfirmed token, and mismatch. TypeScript compiles.

---

### F14 — Public Sweepstakes page
**File:** `src/app/sweepstakes/page.tsx`

Replace placeholder with full implementation as specified in SPEC.md §9. `revalidate = 60`. 5 sections (conditional on active sweepstake). `<CountdownTimer>` for hero section. Past winners section shown only if drawn sweepstakes with winner_user_id exist. Active sample products listed in "Ways to earn entries" section.

**Test:** Page renders. TypeScript compiles. "Coming soon" branch renders when no active sweepstake.

---

### F15 — Official Rules page
**File:** `src/app/sweepstakes/rules/page.tsx`

New static page. 9 legal sections with placeholder content. Required visible string: `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`. No data fetching.

**Test:** Page renders. Placeholder string visible in rendered HTML. TypeScript compiles.

---

### F16 — Profile Entries page
**File:** `src/app/profile/entries/page.tsx`

New server component with `force-dynamic`. Auth via `createClient()`. Data via `adminClient`. Two states: no active sweepstake (message + link) and active sweepstake (entry stats + history + CTAs). Entry history with source labels. Notes shown only for admin_adjustment. CTA section links to `/library` and all active sample products.

**Test:** Page renders for authenticated user with active sweepstake. Redirects to login for unauthenticated users. TypeScript compiles.

---

## [DEVOPS]

### D1 — Apply new migration
Run `supabase db push` (local dev) or apply `20240101000018_export_sweepstake_entries_fn.sql` to the staging/production Supabase instance. Verify the `export_sweepstake_entries` function is accessible.

### D2 — Verify Supabase Storage buckets
Confirm `sample-products` (private) and `covers` (public) buckets exist and are correctly configured. The `sample-products` bucket must require signed URLs for download — no public access. If not already configured, set the bucket `public = false` in Supabase dashboard.

### D3 — Build verification
Run `npm run build` and `npx tsc --noEmit`. Both must pass with zero errors before handoff to QA.
