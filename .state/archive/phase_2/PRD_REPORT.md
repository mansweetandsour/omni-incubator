# PRD Report — Phase 2: Products & Library
**Mode:** Fortification
**Date:** 2026-04-09
**Phase:** 2 of 6

---

## 1. Status

**WARN**

Requirements are substantially complete, consistent with the blueprint, and ready for the Architect to proceed. Three advisory findings are noted below — none are blockers. The most significant is a schema constraint issue (`ebooks.file_path NOT NULL` vs. the two-step create-then-upload flow) that the Architect must address explicitly in SPEC.md. The pipeline may continue.

---

## 2. Fortified Requirements

### FR1 — Admin Layout and Route Protection

The `/admin` route group must use a dedicated layout (`src/app/(admin)/layout.tsx` or equivalent route group) with a persistent sidebar. The sidebar must render the following navigation links in order: Dashboard (placeholder, links to `/admin`), Products (links to `/admin/products`), E-books (placeholder), Sample Products (placeholder), Services (links to `/admin/services`), Orders (placeholder), Users (placeholder), Sweepstakes (placeholder), Coupons (placeholder), Settings (placeholder). All links marked "placeholder" must render as visible sidebar entries that navigate to their route — those routes may return a placeholder page in Phase 2.

**Auth protection is handled exclusively by the existing `src/middleware.ts`** — no new middleware must be created. The existing middleware already:
- Redirects unauthenticated users hitting `/admin/*` to `/login?next={path}`
- Redirects authenticated non-admin users (`profiles.role !== 'admin'`) to `/403`

The admin layout component must NOT reimplement this guard. It may trust that any request reaching the layout has passed middleware. The admin layout must be visually distinct from the public site layout — it must not include the public navbar or footer.

### FR2 — Admin Product CRUD (E-books)

**List page** at `/admin/products`:
- Renders a table of ALL product rows where `type = 'ebook'`, including inactive and soft-deleted rows (admins need visibility into archived products)
- Columns: title, category (from `ebooks.category`), price (formatted from `products.price_cents` as dollars), active status (`products.is_active`), created date, Edit button, Archive button
- Default sort: `products.created_at DESC`
- The Archive button sets `products.deleted_at = NOW()` (soft delete). Archived products are visually distinguished (e.g., dimmed row) but remain visible in the list.

**Create form** at `/admin/products/new`:
- All fields below are required unless marked optional
- `products.title` (TEXT, required)
- `products.description` (TEXT, short blurb, required)
- `products.long_description` (TEXT, markdown textarea, optional)
- `products.price_cents` (displayed as dollars with `$` prefix and two decimal places in the UI; stored as integer cents — conversion: `Math.round(parseFloat(input) * 100)`)
- Cover image upload (optional at create time — see FR3)
- `ebooks.category` (required dropdown): values must be exactly `conceptual`, `skill`, `industry`, `startup_guide`
- `ebooks.subcategory` (TEXT, optional)
- `ebooks.tags` (TEXT[], tag input, optional)
- `ebooks.operator_dependency` (required dropdown): values must be exactly `physical_service`, `hybrid`, `digital_saas`
- `ebooks.scale_potential` (required dropdown): values must be exactly `low`, `medium`, `high`
- `ebooks.cost_to_start` (required dropdown): values must be exactly `under_5k`, `5k_to_50k`, `over_50k`
- `products.custom_entry_amount` (INTEGER, optional — leave NULL if not set)
- `products.is_active` (boolean toggle, default `true`)
- `products.is_coming_soon` (boolean toggle, default `false`)

**Slug generation** (application layer, not editable by admin):
1. `slugify(title)` — lowercase, replace non-alphanumeric with `-`, collapse consecutive `-`
2. Query `products WHERE slug = candidate` — if no conflict, use it
3. If conflict: append `-` + first 6 chars of a new UUID
4. Store in `products.slug`

**On create (transactional)**:
1. Insert `products` row with `type = 'ebook'` (the column name in the DB is `type`, not `product_type`)
2. After insert, the DB trigger `compute_member_price` fires automatically and sets `products.member_price_cents = FLOOR(price_cents * 0.5)`
3. Insert `ebooks` row with `product_id = products.id`, `file_path = ''` (empty string placeholder — see WARN-1 in Section 6), and all taxonomy fields
4. Attempt Stripe sync per FR4

**Edit form** at `/admin/products/[id]/edit`:
- Pre-populated with current values from both `products` and `ebooks` rows (joined by `ebooks.product_id = products.id`)
- Same fields as create form
- Slug is displayed as read-only; not editable
- On save: update both `products` and `ebooks` rows; if `price_cents` changed, trigger new Stripe Price creation per FR4

### FR3 — E-book File Upload

File uploads are handled via a dedicated API route separate from the product create/edit form. The upload section must appear within the product create/edit form but uploads are executed independently via the API route.

**Upload API route**: `POST /api/admin/ebooks/[id]/upload`
- `[id]` is the `products.id` UUID
- Request: `multipart/form-data` with field name `file` (the binary) and field name `type` (`main` | `preview` | `cover`)
- Must use the admin Supabase client (`adminClient` from `src/lib/supabase/admin.ts`) for all storage operations
- Must verify the request is from an authenticated admin before processing — read the session from cookies and check `profiles.role = 'admin'`

**File routing by type**:
- `type = 'main'`: upload to `ebooks` bucket (private), path pattern `ebooks/{product-uuid}/{original-filename}.pdf`, store raw storage path in `ebooks.file_path`
- `type = 'preview'`: upload to `ebook-previews` bucket (public), path pattern `ebook-previews/{product-uuid}/preview-{original-filename}.pdf`, store raw storage path in `ebooks.preview_file_path`
- `type = 'cover'`: upload to `covers` bucket (public), path pattern `covers/{product-uuid}/cover-{original-filename}.{ext}`, store the full public URL in `products.cover_image_url` (covers bucket is public — full URL appropriate for direct use in `<Image>` tags)

**Constraints**:
- Max file size: 100MB — reject with 413 status if exceeded
- Accepted MIME types: `application/pdf` for main and preview; `image/jpeg`, `image/png`, `image/webp` for cover
- Store raw storage path (e.g., `ebooks/abc-uuid/mybook.pdf`) in `ebooks.file_path` and `ebooks.preview_file_path`. Do NOT store signed URLs in the DB.
- Exception: `products.cover_image_url` stores the full public URL (not a path) because covers are in a public bucket and this field is used directly for display.

### FR4 — Stripe Product Sync

Stripe sync runs as an application-side side effect on product create and price update. It is NOT required to succeed for the product to be created — product creation is not blocked by Stripe sync failure.

**On product create** (after `products` row is successfully inserted):
```
if (!process.env.STRIPE_SECRET_KEY) {
  // Skip sync entirely. Product created without Stripe IDs. No error thrown.
  return
}
// Proceed with sync
```

**Sync sequence** (only when `STRIPE_SECRET_KEY` is set):
1. Check `products.stripe_product_id` — if already set (non-null, non-empty), skip creation (idempotent guard)
2. Create Stripe Product with `name = products.title`
3. Create Stripe Price (full price): `unit_amount = products.price_cents`, `currency = 'usd'`, `product = stripe_product_id`
4. Create Stripe Price (member price): `unit_amount = products.member_price_cents`, `currency = 'usd'`, `product = stripe_product_id`. NOTE: `member_price_cents` must be read from the DB row after insert (see WARN-3), not recomputed in application code.
5. Update `products` row: set `stripe_product_id`, `stripe_price_id`, `stripe_member_price_id`

**On price update** (when admin saves an edited product with a changed `price_cents`):
1. Create NEW Stripe Price (full price) — Stripe prices are immutable
2. Create NEW Stripe Price (member price) — read `member_price_cents` from DB after the UPDATE
3. Update `products` row with new `stripe_price_id` and `stripe_member_price_id`
4. Old Stripe Prices are NOT archived or deleted in Phase 2 — this is out of scope

### FR5 — Library Page (`/library`)

**Rendering**: Server Component with `revalidate = 60` (ISR). Filter state lives in URL search params. All filtering and sorting is server-side via Postgres query.

**Data query**: Fetch `products` JOIN `ebooks` WHERE `products.is_active = true AND products.deleted_at IS NULL AND products.type = 'ebook'`.

**Pagination**: 12 products per page. Initial load renders the first 12. "Load more" appends the next 12. The Architect decides whether load-more uses client-side fetching or full page navigation — HOW decision.

**Filter sidebar** (multi-select checkboxes per group):
- Category (filters on `ebooks.category`): `conceptual` → "Conceptual Learning", `skill` → "Skill Learning", `industry` → "Industry Guides", `startup_guide` → "Startup 0→1 Guides"
- Operator Dependency (filters on `ebooks.operator_dependency`): `physical_service` → "Physical / Service", `hybrid` → "Hybrid", `digital_saas` → "Digital / SaaS"
- Scale Potential (filters on `ebooks.scale_potential`): `low` → "Low", `medium` → "Medium", `high` → "High"
- Cost to Start (filters on `ebooks.cost_to_start`): `under_5k` → "Under $5K", `5k_to_50k` → "$5K – $50K", `over_50k` → "Over $50K"

**Filter logic**: OR within each group, AND between groups. A group with no selections active is not applied. Example: `category=conceptual,skill AND scale_potential=high` returns rows where `(ebooks.category IN ('conceptual','skill')) AND (ebooks.scale_potential = 'high')`.

**Sort dropdown** (URL param `?sort=`):
- `newest` (default): `ORDER BY products.created_at DESC`
- `price_asc`: `ORDER BY products.price_cents ASC`
- `price_desc`: `ORDER BY products.price_cents DESC`
- `title_asc`: `ORDER BY products.title ASC`

**Search**: Text input, debounced 300ms client-side, passed as URL search param `?q=`. Server-side query uses case-insensitive match against `products.title`, `products.description`, and `ebooks.tags`. Architect decides exact mechanism (ILIKE, full-text search, or array contains) — HOW decision.

**Product card**:
- Cover image (3:4 aspect ratio, placeholder if `products.cover_image_url` is null)
- Title (`products.title`)
- Author(s) — `ebooks.authors` array joined with `, `
- Category badge — display label derived from `ebooks.category` DB value
- Price — formatted from `products.price_cents`
- Entry badge placeholder — static text "Earn entries"

**Empty state**: "No e-books match your filters" with a "Reset Filters" button that clears all active filter and search params.

### FR6 — E-book Detail Page (`/library/[slug]`)

**Rendering**: Server Component with `revalidate = 60` (ISR). Slug lookup against `products.slug`.

**Data query**: `products JOIN ebooks WHERE products.slug = params.slug AND products.is_active = true AND products.deleted_at IS NULL`. Return `notFound()` if no row matches.

**Required content**:
- Cover image
- `products.title`
- `ebooks.authors` array displayed
- Category badge from `ebooks.category`
- `products.description` (short)
- `products.long_description` rendered as Markdown
- `ebooks.tags` displayed
- Scale metadata: `ebooks.operator_dependency`, `ebooks.scale_potential`, `ebooks.cost_to_start` (display labels, not raw values)
- Price section: `products.price_cents` (full) + `products.member_price_cents` displayed as "Members: $X.XX — 50% off"
- Preview download button: visible only if `ebooks.preview_file_path` is non-null and non-empty; calls `GET /api/ebooks/[id]/preview` where `[id]` = `products.id`
- Buy CTA button: labeled "Buy — $X.XX", always active. If authenticated user has a `user_ebooks` row with matching `ebook_id`, display "You already own this e-book" note near the button — button stays active.
- Entry badge placeholder: static text "Earn entries with purchase"
- Membership upsell toggle: checkbox "Also join Omni Membership (+$15/mo, 7-day free trial)" — state in React local state only, not persisted

### FR7 — Preview Download API

**Route**: `GET /api/ebooks/[id]/preview` — public, no auth required. `[id]` is `products.id`.

**Logic**:
1. Query `ebooks WHERE product_id = params.id` — no row → 404
2. Check `ebooks.preview_file_path` — null or empty → 404 `{ error: 'No preview available' }`
3. Serve or redirect to the file from `ebook-previews` bucket (public bucket — no signed URL needed)
4. Set `Content-Type: application/pdf`
5. Set `Content-Disposition: inline`

### FR8 — Admin Services CRUD

**List page** at `/admin/services`: table of ALL services rows, sort `created_at DESC`. Columns: title, category, rate display, status badge, is_coming_soon badge, Edit, Archive.

**Create/Edit form**:
- `services.title` (TEXT, required)
- `services.description` (TEXT, optional)
- `services.long_description` (TEXT, markdown, optional)
- Slug: auto-generated from title on create, same slugify logic as products. Read-only on edit.
- `services.rate_type` (required dropdown, must match `service_rate_type` ENUM): `hourly`, `fixed`, `monthly`, `custom`
- `services.rate_cents` (shown as dollars, nullable — required unless `rate_type = 'custom'`)
- `services.rate_label` (TEXT, optional)
- `services.category` (TEXT, required free-text)
- `services.tags` (TEXT[], tag input, optional)
- `services.status` (dropdown): `pending`, `approved`, `active`, `suspended` — default `pending`
- `services.is_coming_soon` (boolean toggle, default `true` on create; all Phase 2 services are Coming Soon)
- Archive: sets `services.deleted_at = NOW()`

**Validation**: `rate_cents` must be null when `rate_type = 'custom'`; must be a positive integer otherwise.

### FR9 — Marketplace Page (`/marketplace`)

**Rendering**: Server Component (static or ISR — Architect decides). Replaces the Phase 1 placeholder page.

**Content**:
- Hero section: Coming Soon headline + description (copy is a design decision)
- Service grid: if `services WHERE deleted_at IS NULL` rows exist, render service cards (title, description, category, "Coming Soon" badge)
- Email capture form: static UI with email input and submit button, POSTs to `/api/lead-capture`. The route does not exist in Phase 2 — the form must fail gracefully (404 from the API is acceptable; no user-visible crash)

**No auth required.**

---

## 3. Acceptance Criteria

1. `/admin` route group renders a sidebar layout distinct from the public site layout. Sidebar is visible on all `/admin/*` pages that exist in Phase 2.
2. Unauthenticated requests to `/admin/products` redirect to `/login?next=/admin/products` (existing middleware behavior — no new code required).
3. Authenticated non-admin requests to `/admin/products` redirect to `/403` (existing middleware behavior — no new code required).
4. `/admin/products` renders a table of all `type = 'ebook'` products (including inactive and soft-deleted), sorted by `created_at DESC`.
5. Admin create form at `/admin/products/new` submits and inserts a `products` row with `type = 'ebook'` and a linked `ebooks` row.
6. `products.slug` is auto-generated from title on create. Duplicate slugs are prevented by appending a UUID fragment suffix.
7. `products.member_price_cents` equals `FLOOR(price_cents * 0.5)` after insert (set by DB trigger — application must not override this).
8. Admin edit form at `/admin/products/[id]/edit` pre-populates correctly and saves changes to both `products` and `ebooks` rows.
9. Archive button sets `products.deleted_at = NOW()`. Product remains visible in admin list.
10. `POST /api/admin/ebooks/[id]/upload` with `type=cover` uploads file to `covers` bucket and stores the public URL in `products.cover_image_url`.
11. `POST /api/admin/ebooks/[id]/upload` with `type=main` uploads file to `ebooks` bucket and stores the raw storage path in `ebooks.file_path`.
12. `POST /api/admin/ebooks/[id]/upload` with `type=preview` uploads file to `ebook-previews` bucket and stores the raw storage path in `ebooks.preview_file_path`.
13. Upload API rejects files over 100MB with 413 status.
14. Upload API returns 401 or 403 for requests without a valid admin session.
15. When `STRIPE_SECRET_KEY` is set: product create populates `products.stripe_product_id`, `products.stripe_price_id`, and `products.stripe_member_price_id`.
16. When `STRIPE_SECRET_KEY` is not set: product create succeeds with no error; Stripe columns remain null.
17. Stripe sync is idempotent: re-triggering sync on a product that already has `stripe_product_id` does not create duplicate Stripe objects.
18. `/library` renders without auth. Product grid shows only `is_active = true AND deleted_at IS NULL AND type = 'ebook'` products.
19. Library filter with category `conceptual` AND scale_potential `high` returns only products where BOTH conditions are met (OR within group, AND between groups).
20. Library sort options (newest, price_asc, price_desc, title_asc) each correctly sort the product grid.
21. Library pagination: initial load shows 12 products; Load More shows the next 12.
22. Library search with a query string filters results to products where title, description, or tags match (case-insensitive).
23. Library empty state shows "No e-books match your filters" with a Reset Filters button when no products match.
24. `/library/[slug]` renders all required content: cover, title, authors, category badge, descriptions (markdown rendered), tags, scale metadata, full price + member price, preview download button (if preview exists), Buy CTA, entry badge placeholder, membership upsell toggle.
25. `/library/[slug]` returns 404 for a non-existent, inactive, or deleted slug.
26. Authenticated user who owns an e-book sees "You already own this e-book" note on the detail page. Buy button remains active.
27. `GET /api/ebooks/[id]/preview` returns PDF with `Content-Type: application/pdf` and `Content-Disposition: inline` for a product with `preview_file_path` set.
28. `GET /api/ebooks/[id]/preview` returns 404 for a product with no `preview_file_path`.
29. `/admin/services` renders a table of all services rows sorted by `created_at DESC`.
30. Admin create form at `/admin/services/new` submits and inserts a `services` row with `is_coming_soon = true`.
31. Service slug is auto-generated from title on create. Not editable in the edit form.
32. Services archive button sets `services.deleted_at = NOW()`.
33. `/marketplace` renders without auth: Coming Soon hero + email capture form UI. If services rows exist, service grid is shown.
34. `npm run build` passes with no errors.
35. `npx tsc --noEmit` passes with 0 errors.

---

## 4. Cross-Phase Dependencies

The following decisions are locked in from Phase 1 and must be respected:

**Auth (Phase 1)**:
- Auth strategy: Email OTP + Google OAuth via Supabase Auth — no passwords.
- Session management: Cookie-based via `@supabase/ssr`. Server components use `createServerClient`; client components use `createBrowserClient`.
- Admin role detection: `profiles.role = 'admin'`. The check lives in `src/middleware.ts` only. Phase 2 must NOT create a parallel guard.

**Database conventions (Phase 1)**:
- UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` on all tables, soft-delete via `deleted_at`.
- The `products` table column is named `type` (not `product_type`). E-book products use `type = 'ebook'`.
- `products.member_price_cents` is set by the DB trigger `compute_member_price` — application must read from DB, not recompute.
- Storage paths stored in DB for private-bucket files. Public bucket URLs (covers, avatars) stored as full URLs.

**Supabase clients (Phase 1)**:
- `src/lib/supabase/admin.ts` exports `adminClient` — use in upload and admin API routes.
- `src/lib/supabase/server.ts` exports async `createClient()` — use in Server Components and Route Handlers.

**Storage buckets (Phase 1)**:
- `ebooks` — private; `ebook-previews` — public; `covers` — public; `sample-products` — private; `avatars` — public.

**Sentry (Phase 1)**:
- `@sentry/nextjs` integration is live. New API routes must allow errors to propagate naturally to Sentry — do not catch-and-swallow all errors.

---

## 5. Scope Boundaries

The following are explicitly OUT of scope for Phase 2:

- **Checkout and payment flow** — Phase 3. Buy button is a UI placeholder only. No Stripe Checkout session. No payment intent. No webhook handling.
- **E-book download for owners** (signed URL, ownership check, download_count increment) — Phase 3.
- **Subscription management UI** — Phase 3.
- **Live entry badge calculations and EntryBadge component** — Phase 4A. Static placeholder text only in Phase 2.
- **Lead capture API handler** (`/api/lead-capture` route) — Phase 4A. Form UI wired to path; 404 is acceptable.
- **MultiplierBanner content** — Phase 4A. Banner slot div already placed in root layout from Phase 1.
- **Admin dashboard statistics** — Phase 4B. Dashboard sidebar link may be a placeholder.
- **Service detail page** (`/marketplace/[slug]`) — Phase 5.
- **Sample products** — Phase 4B.
- **Admin users, orders, sweepstakes, coupons pages** — later phases (sidebar links render but routes may be placeholders).
- **SEO metadata and OG images** — Phase 6.
- **Homepage content** — Phase 6.
- **RLS policy audit** — Phase 6.
- **Beehiiv, Resend, Upstash** integrations — Phases 3 and 4A.
- **Old Stripe Price archiving** — out of scope entirely unless explicitly added to a later phase.

---

## 6. Findings

### WARN-1: `ebooks.file_path` is `NOT NULL` but PRD describes a two-step create-then-upload flow
**Risk: MEDIUM | Architect must address in SPEC.md**

The Phase 1 migration `supabase/migrations/20240101000003_products_ebooks.sql` defines:
```sql
file_path TEXT NOT NULL
```

The PRD specifies that on product create, an `ebooks` row is created with a `file_path` placeholder, and the actual PDF is uploaded separately in a second step (via R3 upload API). This means the `ebooks` row must be insertable before a file exists.

**Recommended resolution**: Insert `file_path = ''` (empty string) as the placeholder value. This satisfies the NOT NULL constraint. The upload API (R3) then overwrites it with the actual storage path. The admin UI must clearly indicate when no file has been uploaded (e.g., "No PDF uploaded yet" status indicator).

If the Architect prefers to add a new migration (`ALTER TABLE ebooks ALTER COLUMN file_path DROP NOT NULL`), that is a valid HOW choice — but it requires a new migration file and the Architect must include it. The empty string approach avoids a migration change.

Either approach is acceptable. The Architect must document the chosen approach in SPEC.md.

### WARN-2: Column naming discrepancy — `products.type` vs. `product_type` references in PRD
**Risk: LOW | Advisory**

PRD requirement R2 states "product_type: always 'ebook' for this form." The actual DB column is `products.type` (type `product_type` ENUM). `product_type` is the ENUM type name, not the column name.

All application code must use `products.type`, not `products.product_type`. This naming ambiguity in the PRD has been resolved here — the Architect and Backend agents must use the correct column name.

### WARN-3: `products.member_price_cents` must be read from DB after insert, not recomputed in application
**Risk: LOW | Advisory**

The DB trigger `compute_member_price` fires `BEFORE INSERT OR UPDATE OF price_cents ON public.products` and sets `member_price_cents = FLOOR(price_cents * 0.5)`. The Stripe sync (R4) requires `member_price_cents` to create the member-priced Stripe Price.

Application code must read `products.member_price_cents` from the DB row after insert (using `RETURNING member_price_cents` or a follow-up SELECT) — not recompute it as `Math.floor(price_cents / 2)`. This ensures Stripe always reflects exactly what the DB contains, and decouples the application from the pricing formula.

This applies to both product create and price update flows.

---

## 1. Status

**WARN**

Requirements are substantially complete, consistent with the blueprint, and ready for the Architect to proceed. Four advisory findings are noted below. None are blockers — the pipeline may continue. The Architect should be given this report along with the findings so the SPEC.md addresses them explicitly.

---

## 2. Fortified Requirements

### FR1 — Project Bootstrap
The Architect must initialize a Next.js 14 project using the App Router with TypeScript, Tailwind CSS, and ESLint. All application source files must reside under a `src/` directory. The project must run without errors on `npm run dev` at the end of this phase.

shadcn/ui must be initialized and the following components installed and importable without errors: Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton.

### FR2 — Supabase Client Setup
Three Supabase client modules must be created:

- `src/lib/supabase/client.ts` — browser-safe client using `createBrowserClient` from `@supabase/ssr`. Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `src/lib/supabase/server.ts` — server-side client using `createServerClient` from `@supabase/ssr`. Reads cookies from the Next.js request context. For use in Server Components, Server Actions, and Route Handlers.
- `src/lib/supabase/admin.ts` — service-role client using `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS. Used exclusively in webhook handlers, admin API routes, and the `handle_new_user` trigger's application-side counterpart. Must NOT be imported in any component or browser context.

All three modules must export their clients with correct TypeScript types (using the generated Supabase types when available, or `any` as a placeholder until Phase 2 generates types).

### FR3 — Database Migrations
All SQL migration files must be written in `supabase/migrations/` as sequentially timestamped files (e.g., `20240101000001_initial_schema.sql`). Each file must be syntactically valid SQL.

The following must be covered, in dependency order, across one or more migration files:

**Tables (18 total):**
1. `profiles` — references `auth.users(id) ON DELETE CASCADE`
2. `products` — with `product_type` ENUM (`ebook`, `membership_monthly`, `membership_annual`, `service`)
3. `ebooks` — references `products(id) ON DELETE CASCADE`
4. `services` — with `service_rate_type` ENUM (`hourly`, `fixed`, `monthly`, `custom`); nullable FKs to `products` and `profiles`
5. `orders` — with `order_status` ENUM (`pending`, `completed`, `failed`); references `profiles(id)`
6. `order_items` — references `orders(id) ON DELETE CASCADE`, `products(id)`
7. `subscriptions` — references `profiles(id) ON DELETE CASCADE`, `products(id)`
8. `user_ebooks` — references `profiles(id) ON DELETE CASCADE`, `ebooks(id)`, `orders(id)` (nullable)
9. `sweepstakes`
10. `entry_multipliers` — references `sweepstakes(id) ON DELETE CASCADE`
11. `coupons` — with `coupon_entry_type` ENUM (`multiplier`, `fixed_bonus`); nullable FK to `sweepstakes`
12. `coupon_uses` — references `coupons(id) ON DELETE CASCADE`, `profiles(id)`, `orders(id)` (nullable)
13. `sweepstake_entries` — with `entry_source` ENUM (`purchase`, `non_purchase_capture`, `admin_adjustment`, `coupon_bonus`); nullable FKs to `profiles`, `orders`, `order_items`, `products`, `coupons`
14. `lead_captures` — nullable FKs to `profiles`, `sweepstakes`; deferred FK to `sample_products`
15. `sample_products` — nullable FK to `products`
16. `email_log` — nullable FK to `profiles`
17. `processed_stripe_events`
18. Deferred FK constraints applied via `ALTER TABLE` after all tables exist:
    - `orders.coupon_id → coupons(id)`
    - `sweepstake_entries.lead_capture_id → lead_captures(id)`
    - `lead_captures.sample_product_id → sample_products(id)`

**Functions and triggers (4 required):**
- `public.handle_new_user()` — SECURITY DEFINER, fired AFTER INSERT on `auth.users`. Auto-creates `profiles` row with `display_name` derived from `raw_user_meta_data->>'full_name'` or email prefix, and a unique `username` appended with a 4-char UUID fragment. Also links any pre-existing `lead_captures` rows by email.
- `public.compute_member_price()` — fired BEFORE INSERT OR UPDATE OF `price_cents` on `products`. Sets `member_price_cents = FLOOR(price_cents * 0.5)` when `type = 'ebook'`.
- `public.generate_order_number()` — fired BEFORE INSERT on `orders` WHEN `order_number IS NULL`. Generates `OMNI-YYYYMMDD-XXXXXXXX` format using 8 uppercase hex chars from MD5 of a new UUID.
- `public.set_updated_at()` — fired BEFORE UPDATE on every table with an `updated_at` column. Applied dynamically via a DO block iterating over `information_schema.columns`.

**Indexes:** All indexes from §2.7 of the blueprint must be created, covering: products, ebooks, orders, subscriptions, sweepstake_entries, lead_captures, sample_products, coupons, entry_multipliers.

**Unique partial indexes:**
- `idx_subscriptions_active_user` on `subscriptions(user_id) WHERE status IN ('trialing', 'active')` — prevents double-subscription race condition.
- `idx_sweepstakes_single_active` on `sweepstakes((true)) WHERE status = 'active'` — enforces single active sweepstake at DB level.

**Materialized view:** `public.entry_verification` per §2.5 of the blueprint, with unique index `idx_entry_verification_pk ON entry_verification(user_id, sweepstake_id)`.

**RLS:** Enable RLS on every table and create policies for all access patterns per §15 of the blueprint. Admin check pattern: `(SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'`. The profiles UPDATE policy must prevent users from modifying their own `role` column using `WITH CHECK`.

**Seed data:** Insert two membership products per §2.8 of the blueprint:
- `omni-membership-monthly` — type `membership_monthly`, price_cents 1500
- `omni-membership-annual` — type `membership_annual`, price_cents 12900

### FR4 — Storage Buckets
The following Supabase Storage buckets must be documented. Because bucket creation via SQL migration is not natively supported by the Supabase CLI as of Next.js/Supabase launch tooling, the Architect must create a `supabase/storage.md` file that documents each bucket's name, access level, and CORS requirements for the human operator to create via the Supabase Dashboard or a setup script.

| Bucket name | Access | Signed URL required |
|---|---|---|
| `ebooks` | Private | Yes (1hr expiry, generated on demand in API) |
| `ebook-previews` | Public | No |
| `sample-products` | Private | Yes (1hr expiry) |
| `avatars` | Public | No |
| `covers` | Public | No |

CORS must permit `https://omniincubator.org` (and `http://localhost:3000` for development).

### FR5 — Email OTP Authentication
The `/login` page must:
- Accept an email address input
- On submit, call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
- Transition to a 6-digit OTP code input step (same page, no full reload)
- On code submission, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`
- On success, redirect to the value of the `next` query parameter if present and safe (starts with `/`), otherwise redirect to `/library`
- Display user-facing error states for: invalid code, expired code (with a "resend" link that re-submits the original email)

The Supabase Auth configuration note (OTP mode, 10-minute expiry, magic link disabled) must be included in `supabase/storage.md` or a separate `supabase/auth-config.md` as an external task note for the operator.

### FR6 — Google OAuth Authentication
The `/login` page must include a "Sign in with Google" button that calls:
```
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${NEXT_PUBLIC_SITE_URL}/api/auth/callback` } })
```

A callback route handler at `src/app/api/auth/callback/route.ts` must:
- Extract the `code` query parameter
- Exchange it for a session using `supabase.auth.exchangeCodeForSession(code)`
- Redirect to the value of the `next` query parameter if present, otherwise to `/library`
- Handle errors gracefully (redirect to `/login?error=auth_failed` on failure)

### FR7 — Auth Middleware
`src/middleware.ts` must:
- Use `@supabase/ssr` to refresh the Supabase session on every request (required for SSR cookie-based auth)
- Protect `/profile/*` routes: redirect unauthenticated users to `/login?next={original path}`
- Protect `/admin/*` routes: redirect unauthenticated users to `/login?next={original path}`; redirect authenticated non-admin users to a `/403` page or render a 403 response
- Admin role check reads `profiles.role` via the server client
- All other routes pass through without a session check

The middleware config matcher must cover `/((?!_next/static|_next/image|favicon.ico).*)` or equivalent to avoid running on static assets.

### FR8 — Profile Page
The `/profile` route must be a protected page (middleware-enforced) that:
- Loads the authenticated user's profile from `profiles` using the server client
- Displays: `display_name`, `username`, `bio`, `avatar_url` (as an image), email (read-only, sourced from Supabase auth user, not the profile table), `phone`, `website`
- Provides an edit form (client component) for all editable fields with a Save button
- On save, performs a username uniqueness check: query `profiles WHERE username = newValue AND id != currentUserId`; if a conflict exists, display an inline error without submitting
- On successful save: update the profile row; if `display_name` is non-empty AND `username` is non-empty, set `profile_complete = true`
- Displays a success toast on save; error toast on failure
- Supports avatar upload: user selects an image file, which is uploaded to the `avatars` Storage bucket under a path like `{userId}/avatar.{ext}`; the resulting public URL is stored in `profiles.avatar_url`

### FR9 — Root Layout Shell
`src/app/layout.tsx` must render:
- **Nav bar:** Logo ("Omni Incubator", links to `/`), navigation links to `/library`, `/pricing`, `/marketplace`, `/sweepstakes`. Auth-conditional right section: when logged in — avatar/username with a dropdown containing Profile, My E-books, Orders, Entries, Subscription, Sign Out; when logged out — a "Sign In" button linking to `/login`.
- **Footer:** Links to `/privacy`, `/terms`, `/sweepstakes/rules`; copyright line.
- **Mobile nav:** Hamburger button visible at ≤768px viewport, triggering a slide-out Sheet component containing the same navigation links and auth state. Must open and close correctly.
- **Multiplier banner slot:** An empty, reserved `<div id="multiplier-banner-slot" />` positioned above the nav bar, to be populated in Phase 4A. Must not produce visible UI in Phase 1.
- **Rewardful script:** `<script async src="https://r.wdfl.co/rw.js" data-rewardful={process.env.NEXT_PUBLIC_REWARDFUL_API_KEY}></script>` in the `<head>`. Must load without blocking; must be a no-op when `NEXT_PUBLIC_REWARDFUL_API_KEY` is absent.
- **Toaster:** shadcn/ui `<Toaster />` provider component included in the layout for toast notifications to function site-wide.

### FR10 — Sentry Error Monitoring
Sentry must be installed via `@sentry/nextjs`. The following files must exist and be correctly configured:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `next.config.ts` (or `next.config.js`) must wrap the Next.js config with `withSentryConfig`

All Sentry initialization must read `NEXT_PUBLIC_SENTRY_DSN` and gracefully no-op (do not throw) when the value is absent or empty. A global error boundary must be present in the root layout.

`SENTRY_AUTH_TOKEN` is used for source map uploads during build — must be referenced in the Sentry config but not required for local dev.

### FR11 — Environment Variable Documentation
A `.env.local.example` file must be created in the project root with all 14 environment variables from §14 of the blueprint. Each variable must have blank value and a one-line inline comment explaining its purpose and where to find it. Variables must be clearly grouped as public (`NEXT_PUBLIC_*`) vs server-only (no prefix).

The 14 required variables are:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_MONTHLY_PRICE_ID
STRIPE_ANNUAL_PRICE_ID
BEEHIIV_API_KEY
BEEHIIV_PUBLICATION_ID
RESEND_API_KEY
RESEND_FROM_EMAIL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_REWARDFUL_API_KEY
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SITE_URL
```

Note: The blueprint §14 lists 14 lines but the actual count is 18 distinct variables. The acceptance criterion "14 required keys" in the PRD.md should be treated as referring to all keys in §14, not literally 14. The `.env.local.example` must contain ALL 18 keys listed above.

---

## 3. Acceptance Criteria

1. `npm run dev` completes without errors and the dev server is reachable at `http://localhost:3000`.
2. The `/login` page renders an email input form. Submitting a valid email transitions to the OTP code input step without a full page reload.
3. After OTP verification succeeds (mocked or real), the user is redirected to `/library` (or the `next` param if present).
4. The "Sign in with Google" button is present on `/login` and calls the Supabase OAuth flow. The callback route at `/api/auth/callback` exists and handles the code exchange.
5. All migration files in `supabase/migrations/` are syntactically valid SQL (can be linted with `psql --dry-run` or the Supabase CLI `db lint` command).
6. All 18 tables from FR3 exist in the migration files: `profiles`, `products`, `ebooks`, `services`, `orders`, `order_items`, `subscriptions`, `user_ebooks`, `sweepstakes`, `entry_multipliers`, `coupons`, `coupon_uses`, `sweepstake_entries`, `lead_captures`, `sample_products`, `email_log`, `processed_stripe_events`.
7. The 4 required triggers exist in migrations: `on_auth_user_created`, `set_member_price`, `set_order_number`, `trg_set_updated_at` (on all tables with `updated_at`).
8. The materialized view `entry_verification` and its unique index exist in migrations.
9. Seed data for both membership products is present in migrations.
10. RLS is enabled on all 17 tables (excluding `processed_stripe_events` which uses service role), and policies per §15 of the blueprint are defined for each.
11. All three Supabase client modules exist at `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, and `src/lib/supabase/admin.ts` and export their respective clients without TypeScript errors.
12. `src/middleware.ts` exists and correctly redirects unauthenticated users from `/profile/test` to `/login?next=/profile/test`.
13. `src/middleware.ts` correctly redirects unauthenticated users from `/admin/test` to `/login?next=/admin/test`.
14. Authenticated non-admin users hitting `/admin/*` receive a 403 response or are redirected to a `/403` page (not silently redirected to `/login`).
15. The root layout renders on all pages with: nav bar (logo + 4 nav links + auth state), footer (3 links + copyright), and the Rewardful `<script>` tag in `<head>`.
16. The mobile nav hamburger button is visible at ≤768px viewport and opens/closes the Sheet panel correctly.
17. The multiplier banner slot div is present in the DOM but renders no visible UI.
18. The `/profile` page loads for an authenticated user and displays all profile fields. The edit form submits and updates the profile.
19. Username uniqueness check prevents saving a username already taken by another user and displays an inline error.
20. Avatar upload to the `avatars` Storage bucket succeeds and the resulting public URL is saved to `profiles.avatar_url`.
21. `profile_complete` is set to `true` when both `display_name` and `username` are non-empty after a save.
22. Sentry config files exist (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`). The app starts without errors when `NEXT_PUBLIC_SENTRY_DSN` is absent.
23. `next.config.ts` wraps the config with `withSentryConfig`.
24. `.env.local.example` exists at the project root and contains all 18 environment variable keys.
25. All 10 required shadcn/ui components (Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton) import without errors.
26. `supabase/storage.md` documents all 5 buckets with names, access levels, and CORS requirements.

---

## 4. Cross-Phase Dependencies

None — this is the first phase.

All decisions locked in by this phase that later phases must respect:
- **Auth strategy:** Email OTP + Google OAuth via Supabase Auth. No password-based auth.
- **Session management:** Cookie-based using `@supabase/ssr`. Server components use `createServerClient`; client components use `createBrowserClient`.
- **Admin detection:** `profiles.role = 'admin'` column. RLS policies use `(SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'`. No separate admin table.
- **Database conventions:** UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` on all tables, soft-delete via `deleted_at` on primary entities.
- **Migration tooling:** Supabase CLI, sequential timestamped files in `supabase/migrations/`.
- **Storage paths:** Raw storage paths stored in DB (e.g., `ebooks/{product-uuid}/filename.pdf`), not signed URLs. Signed URLs generated on demand in API handlers (1hr expiry).
- **Source layout:** All app code under `src/`. Supabase config under `supabase/`.
- **Environment variables:** Pattern established in `.env.local.example` for §14 variables.
- **Error monitoring:** Sentry via `@sentry/nextjs`, graceful no-op when DSN absent.

---

## 5. Scope Boundaries

The following are explicitly OUT of scope for Phase 1:

- **Supabase project creation** — EXTERNAL TASK E1. The migrations are written but not run against a live database.
- **Google OAuth credentials** — EXTERNAL TASK E3. The code must work without them (OTP works independently).
- **Sentry project/DSN** — EXTERNAL TASK E10. Sentry must gracefully no-op when DSN is absent.
- **Stripe integration** — Phase 3. No checkout, billing, or Stripe API calls.
- **E-book, product, or library pages** — Phase 2. The nav links to `/library`, `/pricing`, etc. may render as empty pages or 404s.
- **Admin dashboard pages** — Phase 2. The `/admin` route may return a 403 or placeholder; the middleware guard is required but the dashboard itself is not.
- **Homepage content** — Phase 6. The `/` route is the layout shell only.
- **Sweepstakes functionality** — Phases 4A/4B. The nav link to `/sweepstakes` may point to an empty or placeholder page.
- **Lead capture popup** — Phase 4A.
- **Multiplier banner content** — Phase 4A. Only the slot div is placed in the layout.
- **Production deployment** — Phase 6.
- **Beehiiv, Resend, Upstash** integrations — Phases 3 and 4A.
- **RLS policy testing** — Phase 6 (task 6.6). Policies are written in Phase 1, but audit is Phase 6.

---

## 6. Findings

### WARN-1: `.env.local.example` variable count mismatch
**Risk: LOW | Advisory**

The PRD acceptance criterion states: "`.env.local.example` contains all 14 required environment variable keys." However, §14 of the blueprint contains 18 distinct environment variables, not 14. The number "14" appears to be a stale count from an earlier blueprint version. The Architect and Backend agent must use the count of 18 (all variables in §14) as the ground truth. The acceptance criterion has been corrected in Section 3 of this report (AC-24).

### WARN-2: `processed_stripe_events` RLS policy is ambiguous
**Risk: LOW | Advisory**

§15 of the blueprint shows `processed_stripe_events` as accessible only via service role. The PRD does not explicitly include it in the RLS policies list (R3), but R3 says "Enable RLS and create policies for every table per §15." For clarity: `processed_stripe_events` must have RLS enabled with no permissive policies (so only the service-role client, which bypasses RLS, can read/write it). The Architect must include this explicitly in the migration.

### WARN-3: Supabase Storage bucket creation via migration is not supported natively
**Risk: LOW | Advisory**

The Supabase CLI does not support creating Storage buckets via SQL migration files in the same way as schema changes. Buckets are managed via the Supabase Dashboard, the management API, or a setup script. The PRD correctly calls for a `supabase/storage.md` file documenting buckets for manual/scripted creation. However, the acceptance criteria do not include a test for whether buckets actually exist (they can't exist without a live Supabase project — EXTERNAL TASK E1). The Architect should also consider providing a `scripts/create-buckets.ts` setup script using the Supabase management API as an optional deliverable, to reduce manual operator work when E1 is complete.

### WARN-4: `handle_new_user` trigger references `lead_captures` table which may not exist at trigger creation time
**Risk: MEDIUM | Advisory**

The `handle_new_user` trigger function (§2.1 of blueprint) contains:
```sql
UPDATE public.lead_captures SET user_id = NEW.id WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;
```
This references `lead_captures`, which is created later in the migration order (after `sweepstakes` and before `sample_products`). The function itself is safe because PL/pgSQL functions are not validated at creation time — the table reference is only resolved at runtime. However, the Architect must ensure:
1. The trigger function is created AFTER `lead_captures` exists, OR
2. The migration is structured so the function body resolves correctly at runtime (PL/pgSQL late binding makes this safe as long as both are in the same migration run).

The cleanest approach is to create the function and trigger in a migration file that runs after `lead_captures` is created. The Architect should organize migration files to respect this ordering.
