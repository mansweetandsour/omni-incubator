# SPEC.md — Phase 4B: Sample Products & Admin Tools
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools

---

## 1. Overview

Phase 4B completes the sample product flow (CRUD, landing page, download page, download API), admin user management (search + detail + entry adjustment), sweepstakes CSV export, user profile entries page, public sweepstakes page, official rules page, and admin dashboard stats. All schema tables exist from Phase 1 migrations — no new migrations are required except one new Postgres function for the CSV export join.

Key decisions made in this spec:
- Sample product file/cover upload uses a **new** dedicated API route (`/api/admin/sample-products/[id]/upload`) rather than reusing the ebook upload endpoint, to keep bucket and DB column logic cleanly separated.
- Admin user search is implemented via **URL search params on a server component** (not a Server Action), consistent with how the library filter works. The search form uses a standard `<form method="GET">` which reloads the server component with the new `?q=` param.
- `<CountdownTimer endAt={date} />` is a shared client component used on both `/free/[slug]` and `/sweepstakes`.
- The `revalidateTag` two-argument bug (F3) is fixed in both action files as part of Backend work.
- `react-markdown` v10 is already installed. `@tailwindcss/typography` is NOT installed and is incompatible with Tailwind v4's CSS-import config used here. Prose styles are added as custom CSS in `globals.css` using Tailwind v4 `@layer utilities` syntax.
- One new migration: `20240101000018_export_sweepstake_entries_fn.sql` — adds a Postgres RPC function for the CSV export join (Supabase JS client cannot join materialized views via FK syntax).

---

## 2. Stack and Libraries

No new npm packages required. All dependencies are already installed:

| Purpose | Package | Status |
|---|---|---|
| Markdown rendering | `react-markdown` v10.1.0 + `remark-gfm` v4.0.1 | Already installed |
| UI components | shadcn/ui (Badge, Button, Card, Input, Table) | Already installed |
| Supabase clients | `@supabase/ssr`, `@supabase/supabase-js` | Already installed |
| Toast notifications | `sonner` | Already installed |

**Tailwind prose styles:** Add `.prose` utility CSS to `src/app/globals.css` inside `@layer utilities`. Styles needed: headings (h1-h4 font-size and font-weight), paragraphs (line-height, margin), lists (list-style, padding), links (color, underline), code (font-family, background). Dark mode variant via `.dark\:prose-invert`. This replaces `@tailwindcss/typography` entirely.

---

## 3. Environment Variables

No new environment variables required for Phase 4B.

| Variable | Used By |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `adminClient` — all server-side writes, private storage signed URLs |
| `NEXT_PUBLIC_SUPABASE_URL` | All clients |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cookie-based server client for `/profile/entries` auth |
| `NEXT_PUBLIC_SITE_URL` | Canonical URL in `generateMetadata()` |

---

## 4. New Migration

**File:** `supabase/migrations/20240101000018_export_sweepstake_entries_fn.sql`

```sql
CREATE OR REPLACE FUNCTION public.export_sweepstake_entries(p_sweepstake_id UUID)
RETURNS TABLE (
  user_email TEXT,
  display_name TEXT,
  total_entries BIGINT,
  purchase_entries BIGINT,
  non_purchase_entries BIGINT,
  admin_entries BIGINT,
  coupon_bonus_entries BIGINT,
  list_price_basis_cents BIGINT,
  amount_collected_cents BIGINT,
  actual_order_total_cents BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.email          AS user_email,
    p.display_name,
    ev.total_entries,
    ev.purchase_entries,
    ev.non_purchase_entries,
    ev.admin_entries,
    ev.coupon_bonus_entries,
    ev.entries_list_price_basis  AS list_price_basis_cents,
    ev.entries_amount_collected  AS amount_collected_cents,
    ev.actual_order_total        AS actual_order_total_cents
  FROM public.entry_verification ev
  JOIN public.profiles p ON p.id = ev.user_id
  WHERE ev.sweepstake_id = p_sweepstake_id
  ORDER BY ev.total_entries DESC;
$$;
```

Called in the export route as:
```typescript
const { data } = await adminClient.rpc('export_sweepstake_entries', { p_sweepstake_id: id })
```

---

## 5. API Contracts

### POST /api/admin/sample-products/[id]/upload
**File:** `src/app/api/admin/sample-products/[id]/upload/route.ts`
**Auth:** Admin session required. Verify via `createClient()` + profile role check.
**Body:** `multipart/form-data`
- `file`: File (required)
- `type`: `'pdf'` | `'cover'` (required)

Logic:
1. Admin session + role check — return 401/403 on failure.
2. If `type === 'pdf'`:
   - Validate MIME: `application/pdf` only. Return 415 otherwise.
   - Max size: 100MB. Return 413 otherwise.
   - Upload path: `sample-products/{id}/{sanitized_filename}` in `sample-products` bucket (private). `upsert: true`.
   - Update `sample_products.file_path = storagePath` where id = param.
   - Return `{ path: storagePath }`.
3. If `type === 'cover'`:
   - Validate MIME: `image/jpeg|image/png|image/webp`. Return 415 otherwise.
   - Max size: 20MB. Return 413 otherwise.
   - Upload path: `covers/sample-products/{id}/cover-{sanitized_basename}.{ext}` in `covers` bucket (public). `upsert: true`.
   - Get public URL: `adminClient.storage.from('covers').getPublicUrl(storagePath)`.
   - Update `sample_products.cover_image_url = publicUrl` where id = param.
   - Return `{ path: storagePath, url: publicUrl }`.

Filename sanitization: `file.name.replace(/[^a-zA-Z0-9._-]/g, '_')`.

### GET /api/sample-products/[slug]/download
**File:** `src/app/api/sample-products/[slug]/download/route.ts`
**Auth:** None — token-based verification only.
**Query params:** `token` (required)

Logic (exact order):
1. `token` absent → `400 { error: 'Token required' }`.
2. Query `lead_captures WHERE confirmation_token = $token`. Not found → `404 { error: 'Token not found' }`.
3. `lead.confirmed_at IS NULL` → `403 { error: 'Not confirmed' }`.
4. Query `sample_products WHERE slug = $slug AND is_active = true`. Not found → `404 { error: 'Product not found' }`.
5. `lead.sample_product_id !== product.id` → `403 { error: 'Token mismatch' }`.
6. `adminClient.storage.from('sample-products').createSignedUrl(product.file_path, 3600)`.
7. Error from step 6 → `500 { error: 'Failed to generate download link' }`.
8. `NextResponse.redirect(signedUrl.data.signedUrl, { status: 307 })`.

### GET /api/admin/sweepstakes/[id]/export
**File:** `src/app/api/admin/sweepstakes/[id]/export/route.ts`
**Auth:** Admin session required.

Logic:
1. Admin session + role check — return 401/403.
2. `await adminClient.rpc('refresh_entry_verification')` — await completion (not fire-and-forget here; we need fresh data).
3. `const { data } = await adminClient.rpc('export_sweepstake_entries', { p_sweepstake_id: id })`.
4. Build CSV:
   - Header: `user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents`
   - Rows: for each row, values joined by commas. CSV escape: if value contains `,`, `"`, or `\n` — wrap in `"` and double internal `"`.
5. Return `new Response(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="sweepstake-${id}-entries.csv"` } })`.

---

## 6. Server Actions

### `src/app/actions/sample-products.ts`

**`createSampleProduct(formData: FormData): Promise<{ error?: string }>`**
1. Extract: `title` (required), `slug` (required, validate URL-safe: `/^[a-z0-9-]+$/`), `description`, `long_description`, `require_phone` (boolean toggle), `upsell_product_id` (nullable), `upsell_membership` (boolean), `upsell_heading`, `upsell_body`, `custom_entry_amount` (nullable integer ≥ 1 if provided), `is_active` (boolean, default true).
2. Validate `title` non-empty: return `{ error: 'Title is required' }`.
3. Validate `slug` non-empty and matches `/^[a-z0-9-]+$/`: return `{ error: 'Slug must be lowercase letters, numbers, and hyphens only' }`.
4. Slug uniqueness check: `adminClient.from('sample_products').select('id').eq('slug', slug).maybeSingle()`. If exists: return `{ error: 'Slug already exists' }`.
5. Insert row. `file_path = ''` (empty string — PDF uploaded separately after create).
6. `redirect('/admin/sample-products')`.

**`updateSampleProduct(id: string, formData: FormData): Promise<{ error?: string }>`**
- Same field extraction as create.
- Slug uniqueness check excludes current id.
- Update row.
- `revalidatePath('/admin/sample-products')`.
- Return `{ error?: string }`.

**`toggleSampleProductActive(id: string, isActive: boolean): Promise<{ error?: string }>`**
- `adminClient.from('sample_products').update({ is_active: isActive }).eq('id', id)`.
- `revalidatePath('/admin/sample-products')`.
- Return `{ error?: string }`.

### `src/app/actions/admin-users.ts`

**`adjustUserEntries(userId: string, sweepstakeId: string, entries: number, notes: string): Promise<{ success?: boolean; error?: string }>`**
1. Validate `entries !== 0`: return `{ error: 'Entries must be non-zero' }`.
2. Validate `notes.trim().length > 0`: return `{ error: 'Notes are required' }`.
3. Validate `sweepstakeId` matches UUID pattern `/^[0-9a-f-]{36}$/i`: return `{ error: 'Invalid sweepstake' }`.
4. Insert `sweepstake_entries`:
   ```
   { sweepstake_id, user_id: userId, source: 'admin_adjustment',
     base_entries: entries, multiplier: 1.0, coupon_multiplier: 1.0,
     coupon_id: null, bonus_entries: 0, total_entries: entries,
     list_price_cents: 0, amount_cents: 0, notes }
   ```
5. `await refreshEntryVerification()` (import from `@/lib/sweepstakes`).
6. `revalidatePath('/admin/users/' + userId)`.
7. Return `{ success: true }`.

---

## 7. Bug Fixes (F3 — revalidateTag two-argument calls)

**File:** `src/app/(admin)/admin/sweepstakes/actions.ts`
Fix all occurrences of `revalidateTag('...', {})` → `revalidateTag('...')`:
- `activateSweepstake`: lines 26–27 (two calls)
- `endSweepstake`: lines 39–40 (two calls)
- `upsertMultiplier`: line 156
- `toggleMultiplier`: line 174

**File:** `src/app/actions/sweepstakes.ts`
Fix all occurrences of `revalidateTag('...', {})` → `revalidateTag('...')`:
- `activateSweepstake`: lines 87–88
- `endSweepstake`: lines 100–101
- `createMultiplier`: line 142
- `updateMultiplier`: line 183
- `toggleMultiplier`: line 202

---

## 8. Component Specifications

### `<CountdownTimer endAt={string} />`
**File:** `src/components/sweepstakes/CountdownTimer.tsx`
```
'use client'
Props: { endAt: string; className?: string }
```
- `useState<{ days, hours, minutes, seconds } | null>` initialized to null (avoid hydration mismatch).
- `useEffect` sets initial value + starts `setInterval(tick, 1000)`. Clears on unmount.
- `tick()`: computes `diff = new Date(endAt).getTime() - Date.now()`. If `diff <= 0`: set `{ days:0, hours:0, minutes:0, seconds:0 }`.
- `days = Math.floor(diff / 86400000)`, `hours = Math.floor((diff % 86400000) / 3600000)`, `minutes = Math.floor((diff % 3600000) / 60000)`, `seconds = Math.floor((diff % 60000) / 1000)`.
- If `diff <= 0`: renders "Sweepstake ended".
- If state null: renders `&nbsp;` (avoids layout shift on first render).
- Otherwise: renders `{days}d {hours}h {minutes}m {seconds}s`.

### `<SampleProductFileUpload>`
**File:** `src/components/admin/sample-product-file-upload.tsx`
```
'use client'
Props: { productId: string; type: 'pdf' | 'cover'; currentValue: string | null; label: string }
```
- Identical pattern to `FileUploadSection` in `src/components/admin/file-upload-section.tsx`.
- Only difference: POSTs to `/api/admin/sample-products/{productId}/upload` instead of `/api/admin/ebooks/{productId}/upload`.
- Accept: `type === 'pdf'` → `'application/pdf'`; `type === 'cover'` → `'image/jpeg,image/png,image/webp'`.

### `<SampleProductForm>`
**File:** `src/components/admin/sample-product-form.tsx`
```
'use client'
Props: {
  product?: SampleProductRow
  activeEbooks: Array<{ id: string; title: string }>
}
```
- Slug auto-generation from title: `title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')`. Only auto-fills while `slugTouched === false`.
- `slugTouched` boolean state: becomes true on first user keystroke in slug input.
- On submit: `createSampleProduct(formData)` or `updateSampleProduct(id, formData)` via `useTransition`.
- `require_email` toggle: rendered as checked + disabled (always true).
- `custom_entry_amount`: integer input, optional. Client-side validation: if filled, must be ≥ 1.
- Uses `toast` from sonner for error display.

### `<UserEntryAdjustmentForm>`
**File:** `src/components/admin/user-entry-adjustment-form.tsx`
```
'use client'
Props: {
  userId: string
  sweepstakes: Array<{ id: string; title: string; status: string }>
  activeSweepstakeId: string | null
}
```
- Select defaults to `activeSweepstakeId` if set.
- On submit: `adjustUserEntries(userId, sweepstakeId, entries, notes)` via `useTransition`.
- Shows inline validation errors before submission.
- On success: `toast.success('Entry adjustment saved')` + resets form.
- `entries` field: `type="number"` with no `min` (negatives allowed). Validate non-zero client-side too.

### `<LeadCaptureFormFree>`
**File:** `src/components/free/LeadCaptureFormFree.tsx`
```
'use client'
Props: { productId: string; requirePhone: boolean }
```
- State machine: `'idle' | 'loading' | 'success' | 'duplicate' | 'error'`
- POSTs to `/api/lead-capture` with `{ email, phone (if requirePhone), source: 'sample_product', sampleProductId: productId }`.
- Responses:
  - `{ success: true }` → success state
  - `{ duplicate: true }` → duplicate state
  - Any error → error state with message
- Success message: "📧 Check your email! Click the confirmation link to unlock your free download and earn your entries."
- Duplicate message: "📧 You've already entered with this email — check your inbox."

---

## 9. Page Specifications

### `/admin` — Dashboard
**File:** `src/app/(admin)/admin/page.tsx` (REPLACE redirect stub)
- Server component. No `revalidate` (fresh on navigate).
- Parallel fetch via `Promise.all()`:
  1. `adminClient.from('subscriptions').select('id', { count: 'exact', head: true }).in('status', ['trialing', 'active'])` → `count`.
  2. `adminClient.from('orders').select('total_cents').eq('status', 'completed').gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())` → sum in component.
  3. `adminClient.from('sweepstakes').select('id, title, end_at, prize_amount_cents').eq('status', 'active').maybeSingle()` + separate entry count query.
  4. `adminClient.from('orders').select('id, order_number, total_cents, status, created_at, profiles!inner(email)').order('created_at', { ascending: false }).limit(10)`.
  5. Lead capture stats: two count queries or one query with filter aggregation in component.
- Active sweepstake total entries: `adminClient.from('sweepstake_entries').select('total_entries').eq('sweepstake_id', sweepstake.id)` → `sum` in component. Only fetched if active sweepstake exists.
- Days remaining: `Math.ceil((new Date(sweepstake.end_at).getTime() - Date.now()) / 86400000)`.
- Amber warning banner: shown if no active sweepstake — "⚠️ No active sweepstake — purchases are not earning entries." Non-dismissable.
- Revenue: `sum of total_cents / 100` formatted as `$X,XXX.XX`.

### `/admin/sample-products`
**File:** `src/app/(admin)/admin/sample-products/page.tsx` (REPLACE placeholder)
- Server component.
- Query: `adminClient.from('sample_products').select('id, slug, title, is_active, created_at, lead_captures(id, confirmed_at)').order('created_at', { ascending: false })`.
- Per-row stats: `total = row.lead_captures.length`, `confirmed = row.lead_captures.filter(lc => lc.confirmed_at !== null).length`, `rate = total === 0 ? '—' : Math.round(confirmed / total * 100) + '%'`.
- Table columns: Title, Slug, Status (badge), Total Captures, Confirmed, Rate, Actions (Edit link, View Landing Page link, Active toggle).
- "New Sample Product" button → `/admin/sample-products/new`.

### `/admin/sample-products/new`
**File:** `src/app/(admin)/admin/sample-products/new/page.tsx` (NEW)
- Server component. Fetches active ebooks for upsell dropdown: `adminClient.from('products').select('id, title').eq('type', 'ebook').eq('is_active', true).order('title')`.
- Renders `<SampleProductForm activeEbooks={activeEbooks} />`.

### `/admin/sample-products/[id]/edit`
**File:** `src/app/(admin)/admin/sample-products/[id]/edit/page.tsx` (NEW)
- Server component. `params: Promise<{ id: string }>`.
- Fetches `sample_products` by id. If not found: `notFound()`.
- Fetches active ebooks.
- Renders `<SampleProductForm product={product} activeEbooks={activeEbooks} />`.
- Below form: renders two `<SampleProductFileUpload>` sections (PDF, Cover).

### `/admin/users`
**File:** `src/app/(admin)/admin/users/page.tsx` (REPLACE placeholder)
- Server component. `searchParams: Promise<{ q?: string }>`.
- Await `searchParams` before using `q`.
- Query implementation:
  ```typescript
  // No query: most recent 20
  const { data: users } = await adminClient
    .from('profiles')
    .select('id, display_name, email, phone, username, avatar_url, role, created_at, subscriptions(status)')
    .order('created_at', { ascending: false })
    .limit(20)

  // With q: ILIKE search
  const { data: byProfile } = await adminClient
    .from('profiles')
    .select('id, display_name, email, phone, username, avatar_url, role, created_at, subscriptions(status)')
    .or(`email.ilike.%${q}%,phone.ilike.%${q}%,display_name.ilike.%${q}%,username.ilike.%${q}%`)
    .limit(50)

  // Also search by order_number
  const { data: byOrder } = await adminClient
    .from('orders')
    .select('user_id')
    .eq('order_number', q)
    .limit(10)
  // Then fetch profiles for those user_ids and merge (dedup by id)
  ```
- Renders: search form (`<form method="GET"><Input name="q" defaultValue={q ?? ''} /><Button>Search</Button></form>`), results table.
- Empty state: "No users found."
- Table columns: Avatar (initials fallback), Display Name, Email, Role badge, Subscription status badge, Created At. Each row links to `/admin/users/[id]`.

### `/admin/users/[id]`
**File:** `src/app/(admin)/admin/users/[id]/page.tsx` (NEW)
- Server component. `params: Promise<{ id: string }>`.
- Parallel fetch:
  1. Profile: `adminClient.from('profiles').select('*').eq('id', id).single()`. Not found → `notFound()`.
  2. Subscription: `adminClient.from('subscriptions').select('*').eq('user_id', id).maybeSingle()`.
  3. Orders: `adminClient.from('orders').select('id, order_number, total_cents, status, created_at, order_items(id)').eq('user_id', id).order('created_at', { ascending: false })`.
  4. User ebooks: `adminClient.from('user_ebooks').select('acquired_at, download_count, products!inner(title)').eq('user_id', id)`.
  5. Entry breakdown: `adminClient.from('entry_verification').select('sweepstake_id, total_entries, purchase_entries, non_purchase_entries, admin_entries, coupon_bonus_entries, sweepstakes!inner(title)').eq('user_id', id)`. Note: Supabase may not support FK joins on materialized views. If not: fetch `entry_verification` rows then separately fetch sweepstake titles.
  6. Entry history: `adminClient.from('sweepstake_entries').select('created_at, source, total_entries, notes').eq('user_id', id).order('created_at', { ascending: false }).limit(50)`.
  7. All sweepstakes (for adjustment dropdown): `adminClient.from('sweepstakes').select('id, title, status').order('created_at', { ascending: false })`.
- Source label map: `{ purchase: 'Purchase', non_purchase_capture: 'Free Entry', admin_adjustment: 'Admin Adjustment', coupon_bonus: 'Coupon Bonus' }`.

### `/free/[slug]`
**File:** `src/app/free/[slug]/page.tsx` (NEW)
```typescript
export const revalidate = 60
// params: Promise<{ slug: string }>
```
- Server component.
- Fetches: `sample_products WHERE slug = $slug AND is_active = true` via `adminClient`. If null → `notFound()`.
- Fetches active sweepstake: `adminClient.from('sweepstakes').select('id, prize_amount_cents, prize_description, non_purchase_entry_amount, end_at').eq('status', 'active').maybeSingle()`.
- If `upsell_product_id`: fetches `products WHERE id = $upsell_product_id` — `{ id, slug, title, price_cents, member_price_cents, custom_entry_amount, cover_image_url }`.
- Entry count for callout: `product.custom_entry_amount ?? sweepstake?.non_purchase_entry_amount ?? null`.
- Sections in order:
  1. Hero: `<h1>{title}</h1>`, cover image (`<Image>` from `cover_image_url`), description, callout (only if entry count != null and active sweepstake exists).
  2. `<LeadCaptureFormFree productId={product.id} requirePhone={product.require_phone} />`
  3. Markdown (`long_description`) — conditionally rendered.
  4. Upsell section — conditionally rendered.
  5. Sweepstake info block (CountdownTimer + prize + link) — only if active sweepstake exists.
- Markdown render: `import ReactMarkdown from 'react-markdown'` + `import remarkGfm from 'remark-gfm'`. Render inside `<div className="prose prose-zinc max-w-none dark:prose-invert">`.
- `generateMetadata()`: title = `product.title`, description = `product.description ?? ''`, OG image = `product.cover_image_url`, canonical = `${NEXT_PUBLIC_SITE_URL}/free/${slug}`.

### `/free/[slug]/download`
**File:** `src/app/free/[slug]/download/page.tsx` (NEW)
```typescript
export const dynamic = 'force-dynamic'
// params: Promise<{ slug: string }>
// searchParams: Promise<{ token?: string }>
```
- Server component.
- If no token → `redirect('/free/' + slug)`.
- Query `lead_captures WHERE confirmation_token = $token`. Not found → `redirect('/free/' + slug)`.
- `confirmed_at IS NULL` → `redirect('/confirm/' + token)`.
- Fetch product by slug (must be active). Verify `lead.sample_product_id === product.id`. Mismatch → `redirect('/free/' + slug)`.
- Entry count display:
  - Query `sweepstake_entries WHERE lead_capture_id = lead.id`. If rows found: `rows.reduce((sum, r) => sum + r.total_entries, 0)`.
  - If no rows (entry not yet awarded): `product.custom_entry_amount ?? activeSweepstake?.non_purchase_entry_amount ?? 0`.
- Download button: `<a href={/api/sample-products/${slug}/download?token=${token}}>Download</a>` styled as Button.
- Upsell section: same logic as `/free/[slug]` upsell section. Pass product upsell fields.

### `/sweepstakes`
**File:** `src/app/sweepstakes/page.tsx` (REPLACE placeholder)
```typescript
export const revalidate = 60
```
- Server component.
- Parallel fetch:
  1. Active sweepstake: `adminClient.from('sweepstakes').select('id, title, prize_amount_cents, prize_description, end_at, non_purchase_entry_amount').eq('status', 'active').maybeSingle()`.
  2. Past winners: `adminClient.from('sweepstakes').select('id, prize_description, end_at, winner_user_id').eq('status', 'drawn').not('winner_user_id', 'is', null).order('end_at', { ascending: false }).limit(5)`. Then for each, fetch `profiles.display_name WHERE id = winner_user_id`.
  3. Active sample products: `adminClient.from('sample_products').select('id, slug, title, custom_entry_amount').eq('is_active', true).order('created_at', { ascending: false })`.
- No active sweepstake: render "Our next sweepstake is coming soon — check back soon!" message only.
- Past winners display: `display_name`, `prize_description`, date formatted as `new Date(end_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })`.
- Winner display_name fallback: "Anonymous Winner" if null.

### `/sweepstakes/rules`
**File:** `src/app/sweepstakes/rules/page.tsx` (NEW)
- Static page. No data fetching. No `export const revalidate`.
- Required verbatim string at top (visible in page): `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`.
- 9 sections (h2 headings): No Purchase Necessary, How to Enter, Eligibility, Prize Description, Odds of Winning, Drawing Method, Winner Notification, Claiming the Prize, Sponsor.
- Each section has 1-3 sentences of placeholder legal text.

### `/profile/entries`
**File:** `src/app/profile/entries/page.tsx` (NEW)
```typescript
export const dynamic = 'force-dynamic'
```
- Server component.
- Auth: `const supabase = await createClient()`. Get user: `supabase.auth.getUser()`. If no user → `redirect('/login?next=/profile/entries')`.
- Data queries use `adminClient` (bypass RLS):
  1. Active sweepstake.
  2. If no active sweepstake → render empty state.
  3. `entry_verification WHERE user_id = $userId AND sweepstake_id = $sweepstakeId`. No row = all zeros.
  4. `sweepstake_entries WHERE user_id = $userId AND sweepstake_id = $sweepstakeId ORDER BY created_at DESC LIMIT 50`.
  5. Active sample products for CTA.
- Source labels: `{ purchase: 'E-book Purchase', non_purchase_capture: 'Free Entry', admin_adjustment: 'Admin Adjustment', coupon_bonus: 'Coupon Bonus' }`.
- Only show `notes` field in history for `source === 'admin_adjustment'`.
- Large number display: `{total_entries}` with label "Total Entries".
- Mini stats row: 4 stat cards for purchase/non_purchase/admin/coupon breakdown.

---

## 10. File Structure Summary

### New Files
```
supabase/migrations/20240101000018_export_sweepstake_entries_fn.sql

src/app/api/sample-products/[slug]/download/route.ts
src/app/api/admin/sample-products/[id]/upload/route.ts
src/app/api/admin/sweepstakes/[id]/export/route.ts

src/app/actions/sample-products.ts
src/app/actions/admin-users.ts

src/app/(admin)/admin/page.tsx                              (REPLACE redirect stub)
src/app/(admin)/admin/sample-products/page.tsx              (REPLACE placeholder)
src/app/(admin)/admin/sample-products/new/page.tsx          (NEW)
src/app/(admin)/admin/sample-products/[id]/edit/page.tsx    (NEW)
src/app/(admin)/admin/users/page.tsx                        (REPLACE placeholder)
src/app/(admin)/admin/users/[id]/page.tsx                   (NEW)

src/app/free/[slug]/page.tsx                                (NEW)
src/app/free/[slug]/download/page.tsx                       (NEW)
src/app/sweepstakes/page.tsx                                (REPLACE placeholder)
src/app/sweepstakes/rules/page.tsx                          (NEW)
src/app/profile/entries/page.tsx                            (NEW)

src/components/sweepstakes/CountdownTimer.tsx               (NEW)
src/components/admin/sample-product-form.tsx                (NEW)
src/components/admin/sample-product-file-upload.tsx         (NEW)
src/components/admin/user-entry-adjustment-form.tsx         (NEW)
src/components/free/LeadCaptureFormFree.tsx                 (NEW)
```

### Modified Files
```
src/app/globals.css                                         (add .prose utility styles)
src/app/(admin)/admin/sweepstakes/actions.ts                (fix revalidateTag — F3)
src/app/actions/sweepstakes.ts                              (fix revalidateTag — F3)
```

---

## 11. Auth Strategy

| Route | Auth Method |
|---|---|
| All `/admin/*` pages | Middleware: session + role='admin' check (already implemented) |
| `POST /api/admin/sample-products/[id]/upload` | `createClient()` + profile role='admin' check |
| `GET /api/admin/sweepstakes/[id]/export` | `createClient()` + profile role='admin' check |
| `GET /api/sample-products/[slug]/download` | No session — token-based only |
| `/profile/entries` | Middleware protects `/profile/*`; server component also checks session |
| `/free/*`, `/sweepstakes*` | Public — no auth |

---

## 12. Caching and Revalidation

| Route | Strategy |
|---|---|
| `/free/[slug]` | `export const revalidate = 60` |
| `/sweepstakes` | `export const revalidate = 60` |
| `/sweepstakes/rules` | Static (no revalidate declaration) |
| `/free/[slug]/download` | `export const dynamic = 'force-dynamic'` |
| `/profile/entries` | `export const dynamic = 'force-dynamic'` |
| Admin pages | No revalidate; `revalidatePath()` called after mutations |
| Sample product list | `revalidatePath('/admin/sample-products')` after create/update/toggle |
| User detail | `revalidatePath('/admin/users/' + userId)` after entry adjustment |

---

## 13. Non-Functional Requirements

- **TypeScript:** All pages use `Promise<{ params }>` and `Promise<{ searchParams }>` and await them — consistent with existing codebase pattern (e.g., `src/app/(admin)/admin/sweepstakes/[id]/page.tsx`).
- **Null safety:** `entry_verification` may have no row — treat as all-zero stats. `sweepstake.prize_amount_cents` may be null — format as "—" if null. `confirmed_at` null check before string ops.
- **CSV escaping:** Values containing `,`, `"`, or `\n` → wrap in `"`, double internal `"`. Null values → empty string.
- **File size limits:** PDF: 100MB. Cover: 20MB. Return 413 for oversized.
- **Source enum:** Use `'admin_adjustment'` exactly — matches DB enum `entry_source`.
- **Unique constraint bypass:** `sweepstake_entries` has `UNIQUE(order_item_id, sweepstake_id)` but `order_item_id` is NULL for admin adjustments — Postgres NULLs do not violate unique constraints. Multiple admin adjustments per user/sweepstake are allowed.
- **Build safety:** No `revalidateTag(x, {})` calls after this phase. All new files use standard async patterns.
