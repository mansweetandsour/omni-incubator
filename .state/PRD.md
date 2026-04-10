# PRD — Phase 2: Products & Library

## Phase Goal
Build the admin product management system and the public e-book library so that: an admin can create e-book products with files and cover images, and any visitor can browse, filter, search, and preview e-books on the public library page.

## Requirements

### R1 — Admin Layout
- `/admin` route group with a sidebar navigation layout separate from the public site layout
- Sidebar links: Dashboard (placeholder), Products, E-books, Sample Products, Services, Orders, Users, Sweepstakes, Coupons, Settings (all but Products and Services are placeholders for future phases)
- Auth protection: any authenticated user who is NOT an admin (`profiles.role != 'admin'`) gets a 403 page. Unauthenticated users are redirected to `/login?next=/admin`
- Admin middleware already exists from Phase 1 — reuse the role check

### R2 — Admin Product CRUD (E-books)
- List page `/admin/products`: table of all products (including inactive), sortable by created_at desc, with type badge, price, active/inactive status, edit button
- Create/edit form at `/admin/products/new` and `/admin/products/[id]/edit`:
  - Fields: title, description (short), long_description (markdown textarea), price_cents (shown as dollars in UI, stored as cents), cover image upload, category (dropdown: conceptual/skill/industry/startup_guide), subcategory (text), tags (tag input), operator_dependency (dropdown: physical_service/hybrid/digital_saas), scale_potential (dropdown: low/medium/high), cost_to_start (dropdown: under_5k/5k_to_50k/over_50k), custom_entry_amount (optional integer), is_active toggle, is_coming_soon toggle
  - Slug: auto-generated from title on create (slugify, check uniqueness, append UUID fragment if conflict). Not editable by admin.
  - product_type: always 'ebook' for this form
  - On create: also create an `ebooks` row with file_path placeholder (actual file uploaded in R3)
- Soft delete: archive button on list page sets `deleted_at = NOW()`

### R3 — E-book File Upload
- On product create/edit: file upload section for two files:
  1. Main e-book PDF → uploaded to Supabase Storage `ebooks` bucket (private), path stored in `ebooks.file_path`
  2. Preview PDF (optional) → uploaded to Supabase Storage `ebook-previews` bucket (public), path stored in `ebooks.preview_file_path`
- Max file size: 100MB
- Store raw storage path (e.g., `ebooks/{product-uuid}/{filename}.pdf`), NOT a signed URL
- Cover image upload → `covers` bucket (public), URL stored in `products.cover_image_url`
- Upload via API route `POST /api/admin/ebooks/[id]/upload` (multipart form) — uses admin Supabase client

### R4 — Stripe Product Sync
- On admin product create: call Stripe API to create:
  1. Stripe Product with name = product title
  2. Stripe Price (full price) → store `stripe_price_id` on products row
  3. Stripe Price (member price = floor(price_cents * 0.5)) → store `stripe_member_price_id` on products row
  4. Store `stripe_product_id` on products row
- Guard: `if (!process.env.STRIPE_SECRET_KEY) skip Stripe sync` — products can be created without Stripe keys configured, Stripe sync runs when keys are set
- On price update: create new Stripe Prices (Stripe prices are immutable), update stored IDs
- This sync is idempotent: if product already has stripe_product_id, skip creation

### R5 — Library Page
- `/library` (server-rendered with search params for filters + ISR revalidate 60s)
- Product grid: 12 products per page, load more button
- Filter sidebar:
  - Category (multi-select checkboxes): Conceptual Learning, Skill Learning, Industry Guides, Startup 0→1 Guides
  - Operator Dependency (multi-select): Physical/Service, Hybrid, Digital/SaaS
  - Scale Potential (multi-select): Low, Medium, High
  - Cost to Start (multi-select): Under $5K, $5K–$50K, Over $50K
  - Filter logic: OR within each group, AND between groups
- Sort dropdown: Newest (default), Price Low→High, Price High→Low, Title A→Z
- Search: text input, debounced 300ms, searches title + tags + description (client-side filter OR server-side with search param — Architect decides)
- Product card: cover image (3:4 aspect ratio), title, author(s) from ebooks.authors, category badge, price display (full price), entry badge placeholder (shows static "Earn entries" text — live calculation wired in Phase 4A)
- Empty state: "No e-books match your filters" with reset filters button
- Only show products where `is_active = true AND deleted_at IS NULL`
- Public page: no auth required

### R6 — E-book Detail Page
- `/library/[slug]` (server-rendered, ISR revalidate 60s)
- Content: cover image, title, author(s), category badge, description, long_description (rendered markdown), tags, scale metadata (operator_dependency, scale_potential, cost_to_start)
- Price section: full price + member price (shown as "Members: $X.XX — 50% off")
- Preview download button → calls `/api/ebooks/[id]/preview` (public, no auth) → streams preview PDF
- Buy CTA: button labeled "Buy — $X.XX" (placeholder — wired to checkout API in Phase 3). If user is logged in and owns this e-book, show small note "You already own this e-book" but keep the Buy button active.
- Entry badge placeholder: static text "Earn entries with purchase" (wired to EntryBadge component in Phase 4A)
- Membership upsell toggle: checkbox/toggle "Also join Omni Membership (+$15/mo, 7-day free trial)" — stores state locally, passed to checkout in Phase 3

### R7 — Preview Download API
- `GET /api/ebooks/[id]/preview` — public, no auth required
- Look up ebook by product ID, get `preview_file_path`
- If no preview_file_path: return 404
- Stream file from `ebook-previews` bucket (public bucket — use public URL, no signed URL needed)
- Set Content-Type: application/pdf, Content-Disposition: inline

### R8 — Admin Services CRUD
- `/admin/services`: list all services with status badges
- Create/edit form: title, description, long_description, slug (auto-generated), rate_type (dropdown: hourly/fixed/monthly/custom), rate_cents (shown in dollars, nullable when rate_type=custom), rate_label (text, optional display override), category, tags, status (pending/approved/active/suspended), is_coming_soon toggle (default true)
- All services created with `is_coming_soon = true` at launch
- Soft delete (deleted_at)

### R9 — Marketplace Page
- `/marketplace` (public page)
- "Coming Soon" hero section with headline and description
- Grid of service cards if any services exist (with "Coming Soon" badge on each)
- Email capture form placeholder section: static UI only (a form that submits to `/api/lead-capture` — the API route itself is built in Phase 4A; for now, show the form UI and wire to the API route path, it will 404 gracefully until Phase 4A)
- No auth required

## Acceptance Criteria
1. `/admin` redirects to `/admin/products` (or admin dashboard) — non-admins see 403
2. Admin product list shows all products from DB, sortable
3. Admin can create a new e-book product — product row + ebook row created in DB
4. Slug is auto-generated from title on create, no duplicate slugs
5. Cover image upload saves to `covers` bucket, URL stored in products row
6. E-book PDF upload saves to `ebooks` bucket, path stored in ebooks.file_path
7. Preview PDF upload saves to `ebook-previews` bucket, path stored in ebooks.preview_file_path
8. When STRIPE_SECRET_KEY is set: creating a product creates Stripe Product + 2 Prices and stores IDs. When not set: product creates without error.
9. `/library` renders products grid without auth
10. Library filter sidebar correctly filters products (category OR within group, AND between groups)
11. Library sort and pagination work correctly (12 per page, load more)
12. Library search returns products matching title/tags/description
13. `/library/[slug]` renders full e-book detail with all fields
14. Preview download button on detail page calls preview API — returns PDF for products with preview_file_path
15. `/api/ebooks/[id]/preview` returns 404 for products with no preview file
16. Membership upsell toggle exists on detail page and persists state
17. `/marketplace` renders Coming Soon state with any existing services listed
18. Admin services CRUD: create/edit/delete works
19. `npm run build` passes with no errors
20. `npx tsc --noEmit` passes with 0 errors

## Out of Scope for Phase 2
- Actual checkout flow (Buy button is a placeholder — Phase 3)
- Live entry badge calculations (Phase 4A)
- Lead capture API handler (Phase 4A)
- Admin dashboard statistics (Phase 4B)
- Homepage content beyond the placeholder (Phase 6)
- Any billing, subscription, or webhook code
