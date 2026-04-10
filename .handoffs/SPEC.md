# SPEC.md — Phase 2: Products & Library
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 2 — Products & Library

---

## 1. Overview

This specification covers the admin product management system (e-books + services), the public library page, the e-book detail page, the marketplace page, and all supporting API routes and lib utilities. The project has a functioning Next.js 14 App Router skeleton with Supabase Auth, middleware, and shadcn/ui components from Phase 1. All decisions below are final and binding on downstream agents.

---

## 2. Tech Stack Additions

| Concern | Decision | Rationale |
|---|---|---|
| Markdown rendering | `react-markdown` v9 + `remark-gfm` | Widely used, tree-shakeable. `dangerouslySetInnerHTML` rejected — XSS risk. |
| Stripe SDK | Already installed (`stripe` v22 in package.json) | Server-only import. Never used in client components. |
| Slug generation | Custom utility `src/lib/utils/slugify.ts` | No external dependency. 5-line function. |
| File upload | Next.js built-in `request.formData()` | App Router Route Handlers support multipart natively. No multer/busboy. |
| Search mechanism | ILIKE on title + description + tags text cast | Sufficient for Phase 2 scale. Full-text tsvector is Phase 6 work. |
| Load-more pagination | Client-side fetch via `/api/library/products` Route Handler | Keeps `/library` as a pure Server Component for ISR. Client appends cards to local state. |

---

## 3. Key Architecture Decisions

### 3.1 Admin Layout Route Group

- Route group: `src/app/(admin)/`
- Layout file: `src/app/(admin)/layout.tsx` — must NOT include public `<Navbar>` or `<Footer>`. Provides admin shell (sidebar + main content area) only.
- The `(admin)` route group nests inside root `layout.tsx`. `<Providers>` and `<Toaster>` are already provided by root layout. Admin layout does NOT re-wrap in `<Providers>`.
- Auth protection: exclusively handled by `src/middleware.ts` (Phase 1). The admin layout makes no role check.
- Admin sidebar: `src/components/admin/admin-sidebar.tsx` — Server Component.

### 3.2 `ebooks.file_path` NOT NULL — Decision: Empty String Placeholder

**No new migration.** Insert `file_path = ''` on ebooks row create. The NOT NULL constraint is satisfied. The upload API overwrites it with the real storage path. Admin UI shows "No PDF uploaded" indicator when `file_path === ''`.

### 3.3 Admin Forms: Server Actions

All admin create/edit forms use **Next.js Server Actions**. File binary uploads use `POST /api/admin/ebooks/[id]/upload` Route Handler (streaming binary to a Server Action is impractical).

### 3.4 Library Search and Pagination

- `/library` page: Server Component, `revalidate = 60`. All filtering/sorting/searching is server-side via Postgres query.
- Search: URL param `?q=`. ILIKE against `products.title`, `products.description`, and text cast of `ebooks.tags`.
- "Load More": Client Component that fetches `/api/library/products?page=N&...` and appends to local state.
- Search input: Client Component with 300ms debounce that updates URL via `router.push`.

### 3.5 Stripe Lib Location

`src/lib/stripe.ts` — exports the Stripe instance and two sync helpers. Server-only. Never import in client components.

### 3.6 `member_price_cents` Read Rule

After any INSERT or UPDATE on `products`, always use `.select('member_price_cents')` to retrieve the DB-computed value. Never compute `Math.floor(price_cents / 2)` in application code.

---

## 4. Data Models (No Schema Changes in Phase 2)

All tables were created in Phase 1. Phase 2 adds no migrations. Empty string placeholder for `ebooks.file_path` requires no schema change.

### `products` (relevant columns)
`id UUID`, `slug TEXT UNIQUE NOT NULL`, `type product_type`, `title TEXT`, `description TEXT`, `long_description TEXT`, `price_cents INTEGER`, `member_price_cents INTEGER` (trigger-set — never write from app), `stripe_product_id TEXT`, `stripe_price_id TEXT`, `stripe_member_price_id TEXT`, `is_active BOOLEAN DEFAULT true`, `is_coming_soon BOOLEAN DEFAULT false`, `cover_image_url TEXT`, `custom_entry_amount INTEGER`, `created_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`

### `ebooks` (relevant columns)
`id UUID`, `product_id UUID FK→products.id`, `file_path TEXT NOT NULL` (empty string = no file), `preview_file_path TEXT`, `authors TEXT[] DEFAULT '{}'`, `category TEXT NOT NULL`, `subcategory TEXT`, `operator_dependency TEXT`, `scale_potential TEXT`, `cost_to_start TEXT`, `tags TEXT[] DEFAULT '{}'`

### `services` (relevant columns)
`id UUID`, `slug TEXT UNIQUE NOT NULL`, `title TEXT NOT NULL`, `description TEXT`, `long_description TEXT`, `rate_type service_rate_type NOT NULL`, `rate_cents INTEGER`, `rate_label TEXT`, `category TEXT NOT NULL`, `tags TEXT[]`, `status TEXT DEFAULT 'pending'`, `is_coming_soon BOOLEAN DEFAULT true`, `created_at TIMESTAMPTZ`, `deleted_at TIMESTAMPTZ`

### `user_ebooks` (relevant columns)
`user_id UUID FK→profiles.id`, `ebook_id UUID FK→ebooks.id`

---

## 5. API Contract

### 5.1 `POST /api/admin/ebooks/[id]/upload`

**Auth**: Admin-only. Steps:
1. `createClient()` (cookie-based) → `getUser()` → 401 if no user
2. `supabase.from('profiles').select('role').eq('id', user.id).single()` → 403 if `role !== 'admin'`
3. All storage ops use `adminClient`

**Path param**: `[id]` = `products.id` UUID

**Request**: `multipart/form-data`
- `file`: binary
- `type`: `'main'` | `'preview'` | `'cover'`

**Validation**:
- `file.size > 104_857_600` → 413 `{ error: 'File too large. Max 100MB.' }`
- `type=main|preview` requires MIME `application/pdf` → else 415
- `type=cover` requires MIME `image/jpeg` | `image/png` | `image/webp` → else 415

**Routing**:

| type | bucket | path pattern | DB write |
|---|---|---|---|
| `main` | `ebooks` (private) | `ebooks/{product-uuid}/{filename}.pdf` | `ebooks.file_path = storagePath` WHERE `product_id = id` |
| `preview` | `ebook-previews` (public) | `ebook-previews/{product-uuid}/preview-{filename}.pdf` | `ebooks.preview_file_path = storagePath` WHERE `product_id = id` |
| `cover` | `covers` (public) | `covers/{product-uuid}/cover-{filename}.{ext}` | `products.cover_image_url = fullPublicUrl` WHERE `id = productId` |

For `cover`: get public URL via `adminClient.storage.from('covers').getPublicUrl(path).data.publicUrl` — store full URL.

**Success response**: `200 { path: string, url?: string }` — `url` present only for `cover` type.

---

### 5.2 `GET /api/ebooks/[id]/preview`

**Auth**: None — public route.

**Path param**: `[id]` = `products.id` UUID.

**Logic**:
1. `adminClient.from('ebooks').select('preview_file_path').eq('product_id', id).maybeSingle()` → 404 if no row
2. `preview_file_path` null or `''` → `404 { error: 'No preview available' }`
3. `const { data } = adminClient.storage.from('ebook-previews').getPublicUrl(preview_file_path)`
4. `NextResponse.redirect(data.publicUrl)` — 307 redirect to CDN URL

Response headers on redirect: `Content-Type: application/pdf`, `Content-Disposition: inline`

---

### 5.3 `GET /api/library/products`

**Auth**: None — public.

**Query params**:
- `page` (integer, default `1`)
- `q` (string, optional)
- `category` (comma-separated, optional) — values: `conceptual`, `skill`, `industry`, `startup_guide`
- `operator_dependency` (comma-separated, optional)
- `scale_potential` (comma-separated, optional)
- `cost_to_start` (comma-separated, optional)
- `sort` (`newest` | `price_asc` | `price_desc` | `title_asc`, default `newest`)

**Page size**: 12

**Response**:
```json
{
  "products": ProductCard[],
  "hasMore": boolean,
  "total": number
}
```

**ProductCard shape**:
```typescript
{
  id: string
  slug: string
  title: string
  description: string | null
  price_cents: number
  cover_image_url: string | null
  ebook: {
    id: string
    authors: string[]
    category: string
  }
}
```

---

## 6. File and Folder Structure

Files to create or replace in Phase 2:

```
src/
├── app/
│   ├── (admin)/
│   │   ├── layout.tsx                              # Admin shell (sidebar + main)
│   │   └── admin/
│   │       ├── page.tsx                            # Redirect to /admin/products
│   │       ├── products/
│   │       │   ├── page.tsx                        # Product list (Server Component)
│   │       │   ├── new/
│   │       │   │   └── page.tsx                    # Create product form page
│   │       │   └── [id]/
│   │       │       └── edit/
│   │       │           └── page.tsx                # Edit product form page
│   │       ├── services/
│   │       │   ├── page.tsx                        # Service list (Server Component)
│   │       │   ├── new/
│   │       │   │   └── page.tsx                    # Create service form page
│   │       │   └── [id]/
│   │       │       └── edit/
│   │       │           └── page.tsx                # Edit service form page
│   │       ├── ebooks/
│   │       │   └── page.tsx                        # Placeholder
│   │       ├── sample-products/
│   │       │   └── page.tsx                        # Placeholder
│   │       ├── orders/
│   │       │   └── page.tsx                        # Placeholder
│   │       ├── users/
│   │       │   └── page.tsx                        # Placeholder
│   │       ├── sweepstakes/
│   │       │   └── page.tsx                        # Placeholder
│   │       ├── coupons/
│   │       │   └── page.tsx                        # Placeholder
│   │       └── settings/
│   │           └── page.tsx                        # Placeholder
│   ├── actions/
│   │   ├── products.ts                             # Server Actions: createProduct, updateProduct, archiveProduct
│   │   └── services.ts                             # Server Actions: createService, updateService, archiveService
│   ├── api/
│   │   ├── admin/
│   │   │   └── ebooks/
│   │   │       └── [id]/
│   │   │           └── upload/
│   │   │               └── route.ts                # POST /api/admin/ebooks/[id]/upload
│   │   ├── ebooks/
│   │   │   └── [id]/
│   │   │       └── preview/
│   │   │           └── route.ts                    # GET /api/ebooks/[id]/preview
│   │   └── library/
│   │       └── products/
│   │           └── route.ts                        # GET /api/library/products
│   ├── library/
│   │   ├── page.tsx                                # REPLACE placeholder — library listing
│   │   └── [slug]/
│   │       └── page.tsx                            # E-book detail page
│   └── marketplace/
│       └── page.tsx                                # REPLACE placeholder — marketplace
├── components/
│   ├── admin/
│   │   ├── admin-sidebar.tsx                       # Sidebar nav (Server Component)
│   │   ├── product-form.tsx                        # Create/edit ebook form (Client Component)
│   │   ├── product-table.tsx                       # Product list table (Client Component)
│   │   ├── service-form.tsx                        # Create/edit service form (Client Component)
│   │   ├── service-table.tsx                       # Service list table (Client Component)
│   │   └── file-upload-section.tsx                 # File upload UI (Client Component)
│   ├── library/
│   │   ├── product-card.tsx                        # Product card (Server Component)
│   │   ├── filter-sidebar.tsx                      # Filter checkboxes (Client Component)
│   │   ├── search-input.tsx                        # Debounced search (Client Component)
│   │   ├── sort-select.tsx                         # Sort dropdown (Client Component)
│   │   └── load-more-button.tsx                    # Load more (Client Component)
│   └── ebook/
│       ├── ebook-detail.tsx                        # Detail content with upsell toggle (Client Component)
│       └── preview-download-button.tsx             # Preview download CTA (Client Component)
└── lib/
    ├── stripe.ts                                   # Stripe instance + sync helpers (server-only)
    └── utils/
        └── slugify.ts                              # Slug generation utility
```

---

## 7. Server Actions Contract

All Server Actions live at `src/app/actions/` with `'use server'` directive at the top of each file.

All actions perform auth check first:
1. `createClient()` → `getUser()` → return `{ error: 'Unauthorized' }` if no user
2. `supabase.from('profiles').select('role').eq('id', user.id).single()` → return `{ error: 'Forbidden' }` if `role !== 'admin'`

### `src/app/actions/products.ts`

**`createProduct(formData: FormData): Promise<{ id: string; slug: string } | { error: string }>`**
1. Extract and validate all required fields
2. Generate slug: `slugify(title)` → uniqueness check → append `-${uuid.slice(0,6)}` if conflict
3. `supabase.from('products').insert({ type: 'ebook', title, description, long_description, price_cents, is_active, is_coming_soon, custom_entry_amount, slug }).select('id, slug, member_price_cents').single()`
4. `supabase.from('ebooks').insert({ product_id: product.id, file_path: '', category, subcategory, authors: [], operator_dependency, scale_potential, cost_to_start, tags })`
5. `syncStripeProduct(product.id)` — fire-and-forget (wrap in `.catch(console.error)`, do not await)
6. Return `{ id: product.id, slug: product.slug }`

**`updateProduct(id: string, formData: FormData): Promise<{ ok: true; priceChanged: boolean } | { error: string }>`**
1. Validate fields
2. Read current `price_cents` from DB to detect change
3. `supabase.from('products').update({ title, description, long_description, price_cents, is_active, is_coming_soon, custom_entry_amount }).eq('id', id).select('member_price_cents').single()`
4. `supabase.from('ebooks').update({ category, subcategory, operator_dependency, scale_potential, cost_to_start, tags }).eq('product_id', id)`
5. If `price_cents` changed: `syncStripeNewPrices(id, member_price_cents)` — fire-and-forget
6. Return `{ ok: true, priceChanged: boolean }`

**`archiveProduct(id: string): Promise<{ ok: true } | { error: string }>`**
`supabase.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id)`

### `src/app/actions/services.ts`

**`createService(formData: FormData): Promise<{ id: string; slug: string } | { error: string }>`**
1. Validate required fields (title, rate_type, category)
2. Validate: `rate_cents` must be null when `rate_type === 'custom'`; must be positive integer otherwise
3. Generate slug via same slugify + uniqueness logic (against `services` table)
4. `supabase.from('services').insert({ title, description, long_description, slug, rate_type, rate_cents, rate_label, category, tags, status: 'pending', is_coming_soon: true }).select('id, slug').single()`
5. Return `{ id, slug }`

**`updateService(id: string, formData: FormData): Promise<{ ok: true } | { error: string }>`**
Update all fields. `slug` is read-only — not updated.

**`archiveService(id: string): Promise<{ ok: true } | { error: string }>`**
`supabase.from('services').update({ deleted_at: new Date().toISOString() }).eq('id', id)`

---

## 8. Stripe Sync — `src/lib/stripe.ts`

```typescript
// server-only — do not import in client components
import Stripe from 'stripe'
import { adminClient } from './supabase/admin'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
  typescript: true,
})

export async function syncStripeProduct(productId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return
  // 1. Read product: get title, price_cents, member_price_cents, stripe_product_id
  // 2. If stripe_product_id non-null/non-empty: return (idempotent)
  // 3. stripe.products.create({ name: title })
  // 4. stripe.prices.create({ unit_amount: price_cents, currency: 'usd', product: stripeProductId })
  // 5. stripe.prices.create({ unit_amount: member_price_cents, currency: 'usd', product: stripeProductId })
  // 6. adminClient.from('products').update({ stripe_product_id, stripe_price_id, stripe_member_price_id }).eq('id', productId)
}

export async function syncStripeNewPrices(productId: string, memberPriceCents: number): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return
  // 1. Read product: get stripe_product_id, price_cents
  // 2. stripe.prices.create full price → new stripe_price_id
  // 3. stripe.prices.create member price (use memberPriceCents param — DB-sourced) → new stripe_member_price_id
  // 4. adminClient.from('products').update({ stripe_price_id, stripe_member_price_id }).eq('id', productId)
  // Note: old prices are NOT archived in Phase 2
}
```

`memberPriceCents` is always passed from the DB `.select('member_price_cents')` result — never recomputed in JS (WARN-3 compliance).

---

## 9. Slug Generation Utility — `src/lib/utils/slugify.ts`

```typescript
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}
```

**Uniqueness check pattern** (used in both `createProduct` and `createService`):
```typescript
const candidate = slugify(title)
const { data: existing } = await supabase
  .from('products') // or 'services'
  .select('id')
  .eq('slug', candidate)
  .maybeSingle()

const slug = existing
  ? `${candidate}-${crypto.randomUUID().slice(0, 6)}`
  : candidate
```

---

## 10. Admin Layout Structure

**`src/app/(admin)/layout.tsx`** — Server Component (no `'use client'`)
```tsx
import { AdminSidebar } from '@/components/admin/admin-sidebar'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  )
}
```

No `<Navbar>`, `<Footer>`, or `<Providers>`. Root layout provides the HTML shell.

**`src/components/admin/admin-sidebar.tsx`** — Server Component

Sidebar items (in order):
1. Dashboard → `/admin`
2. Products → `/admin/products`
3. E-books → `/admin/ebooks` (placeholder)
4. Sample Products → `/admin/sample-products` (placeholder)
5. Services → `/admin/services`
6. Orders → `/admin/orders` (placeholder)
7. Users → `/admin/users` (placeholder)
8. Sweepstakes → `/admin/sweepstakes` (placeholder)
9. Coupons → `/admin/coupons` (placeholder)
10. Settings → `/admin/settings` (placeholder)

Uses `<Link>` from `next/link`. Active state via `usePathname()` — if active state is needed, sidebar must be split: Server Component wrapper + Client Component for active-link highlighting. Decision: `AdminSidebar` is a Server Component that renders static links; active styling is handled with CSS using Next.js `<Link>` `aria-current` or simply no active state in Phase 2 (acceptable).

All placeholder pages render:
```tsx
export default function PlaceholderPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">[Page Name]</h1>
      <p className="mt-2 text-zinc-500">Coming in a future phase.</p>
    </div>
  )
}
```

---

## 11. Library Page — `/library`

**`src/app/library/page.tsx`** — Server Component

```typescript
export const revalidate = 60

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
})
```

**Supabase query pattern**:
```typescript
let query = supabase
  .from('products')
  .select('id, slug, title, description, price_cents, cover_image_url, ebooks!inner(id, authors, category)', { count: 'exact' })
  .eq('type', 'ebook')
  .eq('is_active', true)
  .is('deleted_at', null)

// Apply category filter (OR within group)
if (categories.length > 0) {
  query = query.in('ebooks.category', categories)
}
// Apply other filter groups similarly

// Apply sort
switch (sort) {
  case 'price_asc': query = query.order('price_cents', { ascending: true }); break
  case 'price_desc': query = query.order('price_cents', { ascending: false }); break
  case 'title_asc': query = query.order('title', { ascending: true }); break
  default: query = query.order('created_at', { ascending: false })
}

// Apply search
if (q) {
  query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
  // tags search: separate filter applied after — filter in JS for tags array match
}

// Pagination: first page
query = query.range(0, 11)
```

Note on tags search: Supabase PostgREST does not support `ilike` on array columns directly via the JS client's `.or()`. Use a workaround: after fetching results, filter in-memory for tags match as well, OR use a raw `.filter()` call:
```typescript
if (q) {
  query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)
}
```
Tags are checked separately via a JS-level `.filter()` on the result set: `products.filter(p => p.ebooks.tags.some(t => t.toLowerCase().includes(q.toLowerCase())))`. This approach is acceptable at Phase 2 scale. If this causes incorrect `total` count, the Backend agent should implement a raw SQL RPC for the search query. The Backend agent must use their judgment here and document their approach in `BACKEND_DONE.md`.

**Page renders**:
- `<SearchInput>` (Client Component) — updates URL on 300ms debounce
- `<FilterSidebar>` (Client Component) — multi-select checkboxes that update URL params
- `<SortSelect>` (Client Component)
- Product grid: 12 `<ProductCard>` components (Server Component)
- `<LoadMoreButton>` (Client Component) — shows if `hasMore = true` (derived from total > 12)
- Empty state if `products.length === 0`

---

## 12. E-book Detail Page — `/library/[slug]`

**`src/app/library/[slug]/page.tsx`** — Server Component

```typescript
export const revalidate = 60

export default async function EbookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
})
```

**Data fetch**:
```typescript
const { data: product } = await supabase
  .from('products')
  .select('*, ebooks!inner(*)')
  .eq('slug', slug)
  .eq('is_active', true)
  .is('deleted_at', null)
  .single()

if (!product) notFound()
```

**Ownership check** (if user authenticated):
```typescript
const { data: { user } } = await supabase.auth.getUser()
let userOwnsEbook = false
if (user) {
  const { data: ue } = await supabase
    .from('user_ebooks')
    .select('id')
    .eq('ebook_id', product.ebooks.id)
    .eq('user_id', user.id)
    .maybeSingle()
  userOwnsEbook = !!ue
}
```

**Rendered content** (via `<EbookDetail>` Client Component for upsell toggle state):
- Cover image (`<Image>` from next/image) — with placeholder if `cover_image_url` null
- Title, authors (joined with `, `)
- Category badge (display label mapped from DB value)
- `description` (short)
- `long_description` via `<ReactMarkdown remarkPlugins={[remarkGfm]}>`
- Tags list
- Scale metadata: operator_dependency, scale_potential, cost_to_start (display labels)
- Price section: full price + "Members: $X.XX — 50% off"
- `<PreviewDownloadButton>` — visible only if `preview_file_path` is non-null and non-empty
- Buy CTA button: "Buy — $X.XX" (placeholder — no action in Phase 2)
- If `userOwnsEbook`: small note "You already own this e-book" near Buy button
- Entry badge placeholder: static text "Earn entries with purchase"
- Membership upsell toggle: `<input type="checkbox">` with label "Also join Omni Membership (+$15/mo, 7-day free trial)" — React `useState` only, not persisted

Display label maps (used in both library and detail):
```typescript
const CATEGORY_LABELS: Record<string, string> = {
  conceptual: 'Conceptual Learning',
  skill: 'Skill Learning',
  industry: 'Industry Guides',
  startup_guide: 'Startup 0→1 Guides',
}
const OPERATOR_LABELS: Record<string, string> = {
  physical_service: 'Physical / Service',
  hybrid: 'Hybrid',
  digital_saas: 'Digital / SaaS',
}
const SCALE_LABELS: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
}
const COST_LABELS: Record<string, string> = {
  under_5k: 'Under $5K',
  '5k_to_50k': '$5K – $50K',
  over_50k: 'Over $50K',
}
```

These label maps live in `src/lib/utils/product-labels.ts` — shared between library page and detail page.

---

## 13. Marketplace Page — `/marketplace`

**`src/app/marketplace/page.tsx`** — replaces Phase 1 placeholder

```typescript
export const revalidate = 60
```

Sections:
1. Hero: "Service Marketplace — Coming Soon" headline + subheading copy
2. Service grid (if any services exist): card per service showing title, description, category, "Coming Soon" badge
3. Email capture form: `<form action="/api/lead-capture" method="POST">` — email input + submit button. No JS needed; 404 from missing API route is silent until Phase 4A.

---

## 14. Admin Product Form — `src/components/admin/product-form.tsx`

Client Component. Props: `product?: { id: string } & ProductWithEbook` (undefined = create mode).

Fields:
- `title` — text input (required)
- `description` — textarea (required)
- `long_description` — textarea (optional, markdown note shown)
- `price` — text input displaying dollars, e.g. "29.99" (required). On submit: `Math.round(parseFloat(value) * 100)` → stored as `price_cents`
- `category` — `<select>` with options: `conceptual`, `skill`, `industry`, `startup_guide`
- `subcategory` — text input (optional)
- `tags` — text input accepting comma-separated values; displayed as chips; converted to `string[]` on submit
- `operator_dependency` — `<select>` with options: `physical_service`, `hybrid`, `digital_saas`
- `scale_potential` — `<select>`: `low`, `medium`, `high`
- `cost_to_start` — `<select>`: `under_5k`, `5k_to_50k`, `over_50k`
- `custom_entry_amount` — number input (optional, nullable)
- `is_active` — checkbox/toggle (default true)
- `is_coming_soon` — checkbox/toggle (default false)
- Slug — read-only display field in edit mode only

File upload sub-sections (three instances of `<FileUploadSection>`):
- Cover image: `type="cover"`, `productId` (available in edit mode; disabled with tooltip "Save product first" in create mode until after first save)
- Main PDF: `type="main"`, same gating
- Preview PDF: `type="preview"`, same gating

Submit:
- Create mode: `formAction={createProduct}` — on success, redirect to `/admin/products/[id]/edit`
- Edit mode: `formAction={updateProduct.bind(null, product.id)}` — on success, show toast "Saved"
- Archive: separate `<button>` with `formAction={archiveProduct.bind(null, product.id)}` — on success, redirect to `/admin/products`

---

## 15. File Upload Section — `src/components/admin/file-upload-section.tsx`

Client Component. Props:
```typescript
{
  productId: string | undefined  // undefined = create mode (upload disabled)
  type: 'main' | 'preview' | 'cover'
  currentValue: string | null    // existing path or url
  label: string                  // e.g. "Main PDF", "Preview PDF", "Cover Image"
}
```

Behavior:
- If `productId` is undefined: show disabled input with "Save product first to enable uploads"
- If `currentValue` is non-empty: show current status indicator (e.g., "File uploaded: [filename]")
- If `currentValue` is empty/null: show "No file uploaded yet"
- `<input type="file" accept="...">` — onChange triggers `fetch('/api/admin/ebooks/${productId}/upload', { method: 'POST', body: formData })`
- Shows upload progress state (loading spinner)
- On success: update displayed status
- On error: show error message inline

---

## 16. Admin Service Form — `src/components/admin/service-form.tsx`

Client Component. Props: `service?: Service` (undefined = create mode).

Fields: title, description, long_description, rate_type (select), rate_cents (dollars input — required unless rate_type=custom), rate_label (optional), category, tags, status (select), is_coming_soon toggle.

Validation: `rate_cents` field hidden/disabled when `rate_type === 'custom'`.

Submit: same Server Action pattern as product form.

---

## 17. Environment Variables

No new environment variables in Phase 2. All Phase 1 variables apply:

| Variable | Used in |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | All Supabase clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/server clients |
| `SUPABASE_SERVICE_ROLE_KEY` | `adminClient` |
| `STRIPE_SECRET_KEY` | `src/lib/stripe.ts` (optional — sync skipped if absent) |

---

## 18. Package Installation Required

Before Backend agent begins:
```bash
npm install react-markdown remark-gfm
```

Add to `package.json` dependencies. Both packages have TypeScript definitions included.

---

## 19. Non-Functional Requirements

| Concern | Requirement |
|---|---|
| TypeScript | All new files: full type coverage. `npx tsc --noEmit` must pass at 0 errors. |
| Build | `npm run build` must pass with no errors. |
| Error handling | Server Actions return `{ error: string }` — never throw in form handlers. API routes let errors propagate to Sentry naturally. |
| Caching | ISR `revalidate = 60` on `/library`, `/library/[slug]`, `/marketplace`. Admin pages are dynamic (no `revalidate`). |
| shadcn/ui | Use existing components: `Button`, `Input`, `Table`, `Badge`, `Card`, `Dialog`, `Tabs`, `Sheet`, `Skeleton`, `Dropdown-menu`. Do not install new shadcn components unless a listed component is insufficient. |
| Supabase joins | Use `!inner` join notation for required FK relations (e.g., `ebooks!inner(...)`). |
| Admin-only storage | Upload API route always uses `adminClient` for storage ops. Cookie-based `createClient()` is used only for auth verification. |
| No parallel middleware | No new middleware files. `src/middleware.ts` handles all route protection. |

---

## 20. WARN Resolutions

| Finding | Resolution |
|---|---|
| WARN-1: `ebooks.file_path NOT NULL` | Empty string `''` placeholder on insert. No migration. Admin UI shows "No PDF uploaded" when `file_path === ''`. |
| WARN-2: `products.type` vs `product_type` | All code uses column `products.type`. `product_type` is the ENUM type name in migrations only — never referenced in application code. |
| WARN-3: `member_price_cents` recompute risk | Always read from DB after INSERT/UPDATE via `.select('member_price_cents')`. Never compute in JS. Passed to Stripe sync from DB value. |
