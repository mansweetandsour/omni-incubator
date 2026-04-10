# TASKS.md — Phase 2: Products & Library
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 2 — Products & Library

Tasks are dependency-ordered. [BACKEND] tasks must be complete before [FRONTEND] tasks begin. Within each section, tasks may be parallelized unless a dependency is noted.

---

## [BACKEND]

### B1 — Install `react-markdown` and `remark-gfm`
Run `npm install react-markdown remark-gfm`. Verify both appear in `package.json` dependencies. `npx tsc --noEmit` must still pass after install.

### B2 — Create `src/lib/utils/slugify.ts`
Create the file. Export `slugify(text: string): string` — lowercase, replace non-alphanumeric chars with `-`, collapse consecutive `-`, trim leading/trailing `-`. No external dependency.

### B3 — Create `src/lib/utils/product-labels.ts`
Create the file. Export four `Record<string, string>` constants: `CATEGORY_LABELS`, `OPERATOR_LABELS`, `SCALE_LABELS`, `COST_LABELS`. Values per SPEC section 12. Used by library page and detail page.

### B4 — Create `src/lib/stripe.ts`
Create the file (server-only). Export `stripe` singleton (Stripe instance with `apiVersion: '2024-06-20'`). Export `syncStripeProduct(productId: string): Promise<void>` and `syncStripeNewPrices(productId: string, memberPriceCents: number): Promise<void>`. Full implementation per SPEC section 9. Guard: `if (!process.env.STRIPE_SECRET_KEY) return` at top of both functions. Idempotency guard in `syncStripeProduct`: read `stripe_product_id` from DB — if non-null and non-empty, return immediately. Use `adminClient` for all DB reads and writes in these functions.

### B5 — Create `src/app/actions/products.ts`
Create the file with `'use server'` directive. Implement `createProduct`, `updateProduct`, `archiveProduct` per SPEC section 7. Auth check at top of every action (cookie client + profiles role check). Slug generation per SPEC section 9. `createProduct` inserts `products` row (type='ebook'), then `ebooks` row (file_path=''), then calls `syncStripeProduct` fire-and-forget. `updateProduct` reads current `price_cents` before update to detect change; calls `syncStripeNewPrices` fire-and-forget if price changed. All actions return `{ error: string }` on failure, never throw.

### B6 — Create `src/app/actions/services.ts`
Create the file with `'use server'` directive. Implement `createService`, `updateService`, `archiveService` per SPEC section 7. Auth check same as B5. Slug generation against `services` table. `createService` always sets `is_coming_soon: true` and `status: 'pending'`. Validation: `rate_cents` must be null when `rate_type === 'custom'`; positive integer otherwise.

### B7 — Create `src/app/api/admin/ebooks/[id]/upload/route.ts`
POST handler. Auth: cookie client → getUser → 401 if null; profiles.role check → 403 if not admin. Parse `request.formData()`. Get `file` (Blob/File) and `type` field. Validate file size (413 if > 104_857_600 bytes). Validate MIME type (415 if invalid per SPEC section 5.1). Route by type to correct bucket and path. Use `adminClient` for storage upload and DB update. Return `200 { path, url? }`. Let errors propagate to Sentry (no catch-all).

### B8 — Create `src/app/api/ebooks/[id]/preview/route.ts`
GET handler. No auth. Param `id` = products.id. Query `ebooks` for `preview_file_path` where `product_id = id`. Return 404 if no row. Return 404 with `{ error: 'No preview available' }` if `preview_file_path` is null or empty string. Get public URL via `adminClient.storage.from('ebook-previews').getPublicUrl(...)`. Return `NextResponse.redirect(publicUrl)` with `Content-Type: application/pdf` and `Content-Disposition: inline` headers.

### B9 — Create `src/app/api/library/products/route.ts`
GET handler. No auth. Parse query params: `page`, `q`, `category`, `operator_dependency`, `scale_potential`, `cost_to_start`, `sort`. Build Supabase query per SPEC section 11. Apply filter groups with `.in()`. Apply sort. Apply ILIKE search on title and description. Apply pagination with `.range()`. Return `{ products: ProductCard[], hasMore: boolean, total: number }`. ProductCard shape per SPEC section 5.3. Tags search: filter in JS after DB query.

---

## [FRONTEND]

Frontend tasks depend on B1–B9 being complete. B5 and B6 (Server Actions) must be complete before admin form pages can be wired up.

### F1 — Create `src/app/(admin)/layout.tsx`
Server Component. Import `AdminSidebar`. Render full-width flex layout: sidebar left, main content right. No Navbar, Footer, or Providers. Background: `bg-zinc-50 dark:bg-zinc-950`.

### F2 — Create `src/components/admin/admin-sidebar.tsx`
Server Component. Renders `<nav>` with all 10 sidebar links per SPEC section 10. Use `<Link>` from `next/link`. Visually styled as a fixed-width left sidebar (e.g., `w-64 min-h-screen border-r`). Include "Omni Incubator Admin" heading at top. All links use `href` as specified. No active-link highlighting in Phase 2 (acceptable).

### F3 — Create admin placeholder pages (8 pages)
Create `page.tsx` for: `/admin/ebooks`, `/admin/sample-products`, `/admin/orders`, `/admin/users`, `/admin/sweepstakes`, `/admin/coupons`, `/admin/settings`. Each renders heading + "Coming in a future phase." paragraph. Also create `/admin/page.tsx` that does `redirect('/admin/products')` using `import { redirect } from 'next/navigation'`.

### F4 — Create `src/components/admin/file-upload-section.tsx`
Client Component. Props per SPEC section 15. Fetch-based upload to `/api/admin/ebooks/[productId]/upload`. Show loading/success/error state inline. Accept attribute per file type (PDF for main/preview, image/* for cover). Disabled state when `productId` is undefined.

### F5 — Create `src/components/admin/product-form.tsx`
Client Component. Props: `product?: ProductWithEbook`. All fields per SPEC section 14. Tags: comma-separated text input converted to array on submit. Price: dollar display, cents conversion on submit. Three `<FileUploadSection>` instances (cover, main PDF, preview PDF) — disabled when `productId` undefined (create mode). Submit via Server Action (`createProduct` or `updateProduct`). Archive button via `archiveProduct`. Show success/error toast using `sonner` (already installed).

### F6 — Create `src/components/admin/product-table.tsx`
Client Component. Props: `products: ProductWithEbook[]`. Renders `<Table>` (shadcn/ui). Columns: title, category badge (display label), price (formatted), active status badge, created date, Edit button (link to `/admin/products/[id]/edit`), Archive button (calls `archiveProduct` Server Action). Archived rows: visually dimmed (`opacity-60`) when `deleted_at` is set. Default sort by `created_at DESC` — sort is applied server-side; table does not re-sort client-side.

### F7 — Create `/admin/products/page.tsx`
Server Component. Query all products WHERE `type = 'ebook'` (include inactive and soft-deleted, no filter). JOIN ebooks. Sort by `created_at DESC`. Pass to `<ProductTable>`. Page heading "Products". "New Product" button linking to `/admin/products/new`.

### F8 — Create `/admin/products/new/page.tsx`
Server Component. Renders page heading "New Product" + `<ProductForm>` with no `product` prop.

### F9 — Create `/admin/products/[id]/edit/page.tsx`
Server Component. Fetch product + ebook row by `params.id`. If not found, `notFound()`. Pass data to `<ProductForm product={productWithEbook}>`.

### F10 — Create `src/components/admin/service-table.tsx`
Client Component. Props: `services: Service[]`. Columns: title, category, rate display (formatted rate_cents as dollars, or rate_label if set, or "Custom"), status badge, is_coming_soon badge, Edit button, Archive button.

### F11 — Create `src/components/admin/service-form.tsx`
Client Component. Props: `service?: Service`. All fields per SPEC section 16. `rate_cents` field hidden/disabled when `rate_type === 'custom'` (use `useState` to watch rate_type selection). Submit via `createService` or `updateService` Server Actions.

### F12 — Create `/admin/services/page.tsx`
Server Component. Query all services (no deleted_at filter — show all including soft-deleted). Sort `created_at DESC`. Pass to `<ServiceTable>`. Page heading "Services". "New Service" button.

### F13 — Create `/admin/services/new/page.tsx`
Server Component. Renders heading "New Service" + `<ServiceForm>` with no `service` prop.

### F14 — Create `/admin/services/[id]/edit/page.tsx`
Server Component. Fetch service by `params.id`. If not found, `notFound()`. Pass to `<ServiceForm service={service}>`.

### F15 — Create `src/components/library/product-card.tsx`
Server Component. Props: `product: ProductCard`. Renders card with cover image (3:4 aspect ratio, `<Image>` with `fill` or fixed dimensions, placeholder if `cover_image_url` null), title, author(s) (`ebook.authors.join(', ')` or "Unknown" if empty), category badge (display label from `CATEGORY_LABELS`), price (formatted from `price_cents`), static "Earn entries" entry badge placeholder. Wrap in `<Link href={/library/${product.slug}}>`.

### F16 — Create `src/components/library/filter-sidebar.tsx`
Client Component. Props: `currentParams: URLSearchParams`. Four filter groups: category, operator_dependency, scale_potential, cost_to_start. Each group is multi-select checkboxes. On change, update URL via `useRouter().push()` with updated params. "Reset Filters" button clears all filter params (keeps `q` and `sort`).

### F17 — Create `src/components/library/search-input.tsx`
Client Component. Props: `defaultValue: string`. Text input with 300ms debounce (use `useEffect` + `setTimeout`). On debounced change, update URL `?q=` param via `useRouter().push()` (shallow). Preserve other existing params.

### F18 — Create `src/components/library/sort-select.tsx`
Client Component. Props: `currentSort: string`. `<select>` or shadcn `<DropdownMenu>` with options: Newest, Price Low→High, Price High→Low, Title A→Z. On change, update URL `?sort=` param via `useRouter().push()`.

### F19 — Create `src/components/library/load-more-button.tsx`
Client Component. Props: `currentParams: URLSearchParams, hasMore: boolean, initialTotal: number`. Shows "Load More" button if `hasMore`. On click, fetches `/api/library/products` with current params + `page=N`. Appends returned products to local `useState` array. Manages loading state. Shows remaining count or hides button when all loaded. Renders appended product cards (re-uses `<ProductCard>`).

### F20 — Replace `src/app/library/page.tsx`
Server Component. `revalidate = 60`. Reads searchParams. Builds Supabase query per SPEC section 11. Renders layout: `<SearchInput>`, `<FilterSidebar>`, `<SortSelect>`, product grid (12 `<ProductCard>` instances), `<LoadMoreButton>`. If `products.length === 0`, render empty state: "No e-books match your filters" + "Reset Filters" button.

### F21 — Create `src/components/ebook/preview-download-button.tsx`
Client Component. Props: `productId: string`. Renders an `<a href={/api/ebooks/${productId}/preview} target="_blank" rel="noopener">` styled as a Button. Only rendered in parent when `preview_file_path` is non-empty.

### F22 — Create `src/components/ebook/ebook-detail.tsx`
Client Component. Props: full product + ebook data + `userOwnsEbook: boolean`. Contains membership upsell toggle state (`useState<boolean>(false)`). Renders all detail page content per SPEC section 12. Uses `<ReactMarkdown>` for `long_description`. Shows "You already own this e-book" note near Buy button if `userOwnsEbook`. Buy button is styled `<button>` — no action in Phase 2 (placeholder). Entry badge: static `<span>Earn entries with purchase</span>`.

### F23 — Create `src/app/library/[slug]/page.tsx`
Server Component. `revalidate = 60`. Fetch product + ebook JOIN by slug. `notFound()` if null. Ownership check per SPEC section 12. Render `<EbookDetail>` Client Component with full data props + `userOwnsEbook` prop.

### F24 — Replace `src/app/marketplace/page.tsx`
Server Component. `revalidate = 60`. Fetch services WHERE `deleted_at IS NULL`. Render: Coming Soon hero section, service grid (if services exist — each card shows title, description, category, "Coming Soon" badge), email capture form (`<form action="/api/lead-capture" method="POST">` — 404 until Phase 4A).

---

## [DEVOPS]

### D1 — Verify Supabase Storage Buckets Exist
Confirm the four buckets exist in Supabase Storage: `ebooks` (private), `ebook-previews` (public), `covers` (public), `sample-products` (private). These were specified in Phase 1. If any are missing, create them via Supabase Dashboard or CLI. Document in `DEPLOY_DONE.md`.

### D2 — Verify Environment Variables
Confirm `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are set in Vercel environment. `STRIPE_SECRET_KEY` is optional — document whether it's configured. If absent, Stripe sync skips silently (by design).

### D3 — Run Build Verification
`npm run build` must pass with 0 errors. `npx tsc --noEmit` must pass with 0 errors. Document results in `DEPLOY_DONE.md`.
