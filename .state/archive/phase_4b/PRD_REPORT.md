# PRD_REPORT.md — Phase 4B: Sample Products & Admin Tools
**PRD Agent Output — Fortification Mode**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools

---

## 1. Status

**WARN**

All requirements are complete, consistent, and ready for the Architect. Seven findings are noted (F1–F7). None are blockers. The Architect may proceed immediately. Key advisory items: `awardAdminAdjustment()` does not exist yet in `sweepstakes.ts` and the Server Action should call `refreshEntryVerification()` directly (F1); the CSV export column names in R7 differ from the materialized view column aliases and must be mapped via SQL aliases (F2); the `revalidateTag` calls in the existing sweepstakes `actions.ts` use a two-argument form that is a TypeScript error (F3).

---

## 2. Fortified Requirements

### R1 — Admin Sample Products CRUD

**R1.1 — List page (`/admin/sample-products`)**
- Renders a table of all `sample_products` rows ordered by `created_at DESC`.
- Columns: title, slug, active status (badge: green "Active" / gray "Inactive"), total captures count, confirmed captures count, confirmation rate (confirmed / total × 100, formatted as "N%", show "—" if no captures).
- Stats are computed by querying `lead_captures WHERE sample_product_id = sp.id`. Confirmed = `confirmed_at IS NOT NULL`. These may be fetched as aggregates in a single query.
- "New Sample Product" button links to `/admin/sample-products/new`.
- Each row has: "Edit" link → `/admin/sample-products/[id]/edit`, "View Landing Page" link → opens `/free/[slug]` in a new tab (`target="_blank"`).

**R1.2 — Create/edit form (`/admin/sample-products/new` and `/admin/sample-products/[id]/edit`)**
Fields and constraints:
- `title` (text, required)
- `slug` (text, required; auto-generated from title on create using kebab-case, user-editable; must be URL-safe: lowercase, hyphens only, no spaces; slug uniqueness checked before save — return inline error if duplicate)
- `description` (textarea, short plain text, optional)
- `long_description` (textarea, markdown, optional)
- `cover_image_url` (file upload → Supabase Storage `covers` bucket, public; store resulting public URL in `cover_image_url` column)
- `file_path` (file upload → Supabase Storage `sample-products` bucket, private; store resulting path in `file_path` column; required)
- `require_email` (toggle, always `true`, rendered as disabled/checked — user cannot change it)
- `require_phone` (toggle, default `false`, user can enable)
- `upsell_product_id` (dropdown of `products WHERE is_active = true`, optional; shows product title in dropdown)
- `upsell_membership` (toggle, default `true`)
- `upsell_heading` (text input, optional)
- `upsell_body` (textarea, optional)
- `custom_entry_amount` (integer input, optional; if set, overrides `sweepstake.non_purchase_entry_amount` for this product's lead captures; must be ≥ 1 if provided)
- `is_active` (toggle, default `true`)

Server Actions:
- `createSampleProduct(formData)`: inserts row, uploads files, redirects to `/admin/sample-products`
- `updateSampleProduct(id, formData)`: updates row, re-uploads files if new files provided
- `toggleSampleProductActive(id, isActive)`: flips `is_active`, revalidates list page

**R1.3 — Schema verification (confirmed)**
The `sample_products` table in `supabase/migrations/20240101000007_lead_captures_samples.sql` contains all required columns: `id, slug, title, description, long_description, cover_image_url, file_path, file_size_bytes, require_email, require_phone, upsell_product_id, upsell_membership, upsell_heading, upsell_body, custom_entry_amount, is_active, created_at, updated_at`. All fields needed by this phase exist. No migration is needed.

---

### R2 — Sample Product Landing Page (`/free/[slug]`)

- Route type: dynamic, ISR with `revalidate = 60`.
- Fetch: `SELECT * FROM sample_products WHERE slug = $slug AND is_active = true`. If no row found (slug not found OR `is_active = false`): return `notFound()`.
- Also fetch: active sweepstake (`sweepstakes WHERE status = 'active' LIMIT 1`) for entry callout and sweepstake info block.
- Entry count to display in callout: `sample_product.custom_entry_amount ?? sweepstake.non_purchase_entry_amount`. If no active sweepstake: omit the entry callout entirely (do not display a misleading entry count).

**Page layout (top to bottom):**

1. **Hero section**: `title` (large heading), `cover_image_url` as Next.js `<Image>` on the left, `description` copy on the right. Below: sweepstake entry callout — "🎟️ Download free + earn {X} entries in our {sweepstake.prize_description ?? 'sweepstake'}!" — shown only if active sweepstake exists.

2. **Capture form**: Email field (always shown, `type="email"`, required). Phone field shown only if `require_phone = true`. Submit button: "Get Free Access". On submit: `POST /api/lead-capture` with body `{ email, phone (if shown), source: 'sample_product', sampleProductId: product.id }`. Loading state on button during fetch. Success state replaces form: "📧 Check your email! Click the confirmation link to unlock your free download and earn your entries." Duplicate state: "📧 You've already entered with this email — check your inbox." Error state: show inline error message.

3. **Content section**: If `long_description` is set, render it as markdown.

4. **Upsell section** (render if `upsell_product_id IS NOT NULL` OR `upsell_membership = true`):
   - Custom heading: render `upsell_heading` if set; else default: "Want to go deeper?"
   - Custom body: render `upsell_body` as plain text if set.
   - If `upsell_product_id` is set: fetch the linked product. Render: cover image, title, price display (full price + member price), `<EntryBadge product={...} />`, "Buy Now" CTA linking to `/library/{ebook_slug}`.
   - If `upsell_membership = true`: render a membership pitch card with "Join Omni Membership" CTA linking to `/pricing`.
   - If both are set, render both.

5. **Sweepstake info block** (render only if active sweepstake exists): current prize amount (formatted as "$X,XXX"), countdown timer to `sweepstake.end_at` (client component), link to `/sweepstakes`.

**SEO**: Export `generateMetadata()` using product `title` and `description`. OG image: `cover_image_url` (if set). Canonical URL: `https://omniincubator.org/free/{slug}`.

---

### R3 — Sample Product Download Page (`/free/[slug]/download`)

- Route type: dynamic, `force-dynamic` (token verification must not be cached).
- No auth required.
- Query param: `token` (from URL search params).
- On render (server component):
  - If `token` is absent or empty: redirect to `/free/{slug}`.
  - Query `lead_captures WHERE confirmation_token = $token`. If no row found: redirect to `/free/{slug}`.
  - If row found but `confirmed_at IS NULL`: redirect to `/confirm/{token}` (the confirm page handles the pending state).
  - If row found and `confirmed_at IS NOT NULL`: render download page.
- Download page content:
  - `cover_image_url` as `<Image>` (fetch `sample_products` by slug; verify `sample_product.id = lead.sample_product_id`; if mismatch: redirect to `/free/{slug}`).
  - Product `title` as heading.
  - "Download" button: on click, navigates to `GET /api/sample-products/{slug}/download?token={token}`.
  - Entry confirmation message: "🎟️ You earned {X} entries!" where X = `total_entries` from `sweepstake_entries WHERE lead_capture_id = lead.id`. If no entry row yet: show X = `sample_product.custom_entry_amount ?? sweepstake.non_purchase_entry_amount`.
  - Upsell section: same as landing page section 4.

---

### R4 — Sample Product Download API (`GET /api/sample-products/[slug]/download`)

- Route: `GET /api/sample-products/[slug]/download` — public, no auth cookie required.
- Query param: `token` (required).
- Logic:
  1. If `token` is absent: return `400 { error: 'Token required' }`.
  2. Query `lead_captures WHERE confirmation_token = $token`. If not found: return `404 { error: 'Token not found' }`.
  3. If `lead_captures.confirmed_at IS NULL`: return `403 { error: 'Not confirmed' }`.
  4. Query `sample_products WHERE slug = $slug`. If not found or `is_active = false`: return `404 { error: 'Product not found' }`.
  5. Verify `lead_captures.sample_product_id = sample_products.id`. If mismatch: return `403 { error: 'Token mismatch' }`.
  6. Generate signed URL: `adminClient.storage.from('sample-products').createSignedUrl(sample_product.file_path, 3600)`.
  7. If signed URL generation fails: return `500 { error: 'Failed to generate download link' }`.
  8. Return `NextResponse.redirect(signedUrl, { status: 307 })`.
- Use `adminClient` (service role) for storage signed URL generation.

---

### R5 — Admin User Management

**R5.1 — Search page (`/admin/users`)**
- Text search input; search executes on form submit or debounced input (Architect's choice).
- Search query: profiles matching `email ILIKE $q OR phone ILIKE $q OR display_name ILIKE $q OR username ILIKE $q`, plus exact match on `orders.order_number`. Limit 50 results. Left join subscriptions to get subscription status.
- Results table columns: avatar (fallback initials), `display_name`, `email`, role badge (admin: red, user: gray), subscription status badge (active/trialing: green, all others: gray), `created_at`.
- Each row is a link to `/admin/users/[id]`.
- Empty state: "No users found." With no search term: show most recent 20 users.

**R5.2 — User detail page (`/admin/users/[id]`)**

Sections:
1. **Profile**: `display_name`, `email`, `phone`, `role` badge, `stripe_customer_id` (monospace), `created_at`.
2. **Subscription**: plan name, `status` badge, `trial_end` (if applicable), `current_period_end`, `cancel_at_period_end` warning. Show "No subscription" if none.
3. **Orders**: table — `order_number`, `created_at`, `total_cents` (formatted), `status` badge, items count. Ordered `created_at DESC`.
4. **E-books**: list of `user_ebooks` — product title, acquired date, download count.
5. **Entry breakdown**: from `entry_verification WHERE user_id = $id` — per sweepstake: title, total entries, purchase entries, non-purchase entries, admin adjustments, coupon bonuses. Fetch sweepstake title via join.
6. **Entry history**: `sweepstake_entries WHERE user_id = $id ORDER BY created_at DESC LIMIT 50`. Per row: `created_at`, source label, `total_entries`, `notes` (shown for `admin_adjustment` only).
7. **Entry adjustment form** (see R6).

---

### R6 — Admin Entry Adjustment

- Form embedded on `/admin/users/[id]` page.
- Fields:
  - `sweepstake_id` (select dropdown of all sweepstakes ordered `created_at DESC`; default: the `status = 'active'` sweepstake if any).
  - `entries` (integer, required; must be non-zero; negative values are allowed).
  - `notes` (text, required, minimum 1 character).
- On submit: Server Action `adjustUserEntries(userId, sweepstakeId, entries, notes)`:
  1. Validate: `entries !== 0`; `notes` non-empty; `sweepstakeId` is a valid UUID.
  2. Insert `sweepstake_entries` row:
     - `sweepstake_id`, `user_id`, `source = 'admin_adjustment'`
     - `base_entries = entries`, `multiplier = 1.0`, `coupon_multiplier = 1.0`, `coupon_id = null`, `bonus_entries = 0`, `total_entries = entries`
     - `list_price_cents = 0`, `amount_cents = 0`, `notes = notes`
  3. Call `refreshEntryVerification()` (imported from `@/lib/sweepstakes`).
  4. Call `revalidatePath('/admin/users/' + userId)`.
  5. Return `{ success: true }` or `{ error: string }`.
- The `UNIQUE(order_item_id, sweepstake_id)` constraint does not apply here (`order_item_id` is NULL; Postgres NULLs are not unique-equal), so multiple admin adjustments for the same user/sweepstake are allowed.

---

### R7 — Sweepstakes CSV Export (`GET /api/admin/sweepstakes/[id]/export`)

- Route: `src/app/api/admin/sweepstakes/[id]/export/route.ts` (consistent with blueprint §10 API map).
- Auth: admin only. Verify `profiles.role = 'admin'` for the session user. Return `403` if not admin or unauthenticated.
- Logic:
  1. Call `await adminClient.rpc('refresh_entry_verification')` and wait for completion before querying.
  2. Query:
     ```sql
     SELECT
       p.email AS user_email,
       p.display_name,
       ev.total_entries,
       ev.purchase_entries,
       ev.non_purchase_entries,
       ev.admin_entries,
       ev.coupon_bonus_entries,
       ev.entries_list_price_basis AS list_price_basis_cents,
       ev.entries_amount_collected AS amount_collected_cents,
       ev.actual_order_total AS actual_order_total_cents
     FROM entry_verification ev
     JOIN profiles p ON p.id = ev.user_id
     WHERE ev.sweepstake_id = $id
     ORDER BY ev.total_entries DESC
     ```
  3. Build CSV: header row then data rows. Escape values containing commas or quotes (wrap in `"`, double internal `"`).
  4. Return `Response` with `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="sweepstake-{id}-entries.csv"`.

**Column name mapping note**: The `entry_verification` view columns are `entries_list_price_basis`, `entries_amount_collected`, `actual_order_total`. The blueprint §5.7 CSV headers are `list_price_basis_cents`, `amount_collected_cents`, `actual_order_total_cents`. The SELECT aliases above implement this mapping. No schema change is needed.

---

### R8 — User Entries Profile Page (`/profile/entries`)

- Route type: `force-dynamic`. Auth required (middleware protects `/profile/*`).
- Fetch current user ID from session via `createServerClient` from `@/lib/supabase/server`.
- Fetch active sweepstake: `sweepstakes WHERE status = 'active' LIMIT 1`.
- If no active sweepstake: render "No active sweepstake right now. Check back soon!" with link to `/sweepstakes`.
- If active sweepstake:
  - Fetch from `entry_verification WHERE user_id = $userId AND sweepstake_id = $sweepstakeId`. No row = all zeros.
  - Display:
    1. Large number: `total_entries` (or 0).
    2. Mini stats: purchase entries, non-purchase entries ("Free"), admin adjustments, coupon bonuses.
    3. Entry history: `sweepstake_entries WHERE user_id = $userId AND sweepstake_id = $sweepstakeId ORDER BY created_at DESC LIMIT 50`. Per row: `created_at`, source label, `total_entries`, `notes` (admin_adjustment only).
    4. "How to earn more entries" section: link to `/library`, plus links to each `sample_products WHERE is_active = true` (show product title → `/free/{slug}`).

---

### R9 — Public Sweepstakes Page (`/sweepstakes`)

- Route type: ISR with `revalidate = 60`.
- Fetch: active sweepstake, drawn sweepstakes with winners (limit 5), active sample products.
- If no active sweepstake: render "Our next sweepstake is coming soon — check back soon!" only.
- If active sweepstake, sections in order:

1. **Hero**: prize amount (formatted "$X,XXX"), `prize_description`. Countdown timer to `end_at` (client component).
2. **"How it works"**: 3 static steps.
3. **"Ways to earn entries"**: free capture (N entries), e-book purchase (1 per $1 list price), membership, active sample products (card per product with link to `/free/{slug}` and entry count).
4. **Link to rules**: `/sweepstakes/rules`.
5. **Past winners** (if any drawn sweepstakes with `winner_user_id`): display_name, prize_description, formatted draw date.

---

### R10 — Official Rules Page (`/sweepstakes/rules`)

- Route type: static (no data fetching, no `revalidate`).
- Sections: No Purchase Necessary, How to Enter, Eligibility (18+, US residents), Prize Description, Odds of Winning, Drawing Method, Winner Notification, Claiming the Prize, Sponsor.
- The following placeholder must appear verbatim, visible in the rendered page: `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`.

---

### R11 — Admin Dashboard (`/admin`)

- Replace redirect-only `src/app/(admin)/admin/page.tsx` with a real server component dashboard.
- Fetch in parallel:
  - Active member count: `COUNT(*) FROM subscriptions WHERE status IN ('trialing', 'active')`.
  - Revenue this month: `SUM(total_cents) FROM orders WHERE status = 'completed' AND created_at >= date_trunc('month', now())`.
  - Active sweepstake: id, title, `end_at`, total entry count.
  - Recent orders: last 10 (`orders ORDER BY created_at DESC LIMIT 10`) joined with `profiles` for email.
  - Pending lead confirmations: `COUNT(*) FROM lead_captures WHERE confirmed_at IS NULL AND created_at > now() - interval '7 days'`.
  - Confirmed today: `COUNT(*) FROM lead_captures WHERE confirmed_at >= date_trunc('day', now())`.
- Layout:
  1. Stats row: 4 cards — "Active Members", "Revenue This Month", "Active Sweepstake" (title + days remaining or "None"), "Lead Captures" (pending / confirmed today).
  2. Amber warning banner if no active sweepstake: "⚠️ No active sweepstake — purchases are not earning entries." Non-dismissable.
  3. Recent orders table: user email, total (formatted), status badge, date.
  4. Link to full sweepstake stats if active sweepstake exists.
- Days remaining: `Math.ceil((new Date(end_at).getTime() - Date.now()) / 86400000)`.

---

## 3. Acceptance Criteria

1. `sample_products` table contains all required columns (no migration needed — confirmed in `20240101000007_lead_captures_samples.sql`).
2. Admin can create a sample product with all fields, PDF upload to `sample-products` bucket, cover upload to `covers` bucket.
3. Admin can edit a sample product and toggle active status.
4. `/admin/sample-products` list shows capture count, confirmed count, and confirmation rate per product.
5. `/free/[slug]` renders for `is_active = true`; returns 404 for `is_active = false` or unknown slug.
6. `/free/[slug]` capture form POSTs to `/api/lead-capture` with `source: 'sample_product'` and `sampleProductId`.
7. `/free/[slug]` shows phone field only when `require_phone = true`.
8. `/free/[slug]` entry callout shows `custom_entry_amount` if set, else `sweepstake.non_purchase_entry_amount`; callout absent when no active sweepstake.
9. `/free/[slug]/download?token={confirmed_token}` renders download button, entry count, and upsell section.
10. `/free/[slug]/download?token={unconfirmed_token}` redirects to `/confirm/{token}`.
11. `/free/[slug]/download` with no token redirects to `/free/{slug}`.
12. `/free/[slug]/download` with confirmed token for a different product's lead capture redirects to `/free/{slug}` (token/product mismatch).
13. `GET /api/sample-products/[slug]/download?token={confirmed_token}` returns 307 redirect to Supabase signed URL (1hr expiry).
14. `GET /api/sample-products/[slug]/download?token={unconfirmed_token}` returns 403.
15. `GET /api/sample-products/[slug]/download` with no token returns 400.
16. `/admin/users` search by email returns matching results; search by order_number returns matching user.
17. `/admin/users/[id]` shows profile, subscription, orders, e-books, entry breakdown, and entry history.
18. Admin entry adjustment with positive entries creates a `sweepstake_entries` row with `source = 'admin_adjustment'` and `total_entries > 0`.
19. Admin entry adjustment with negative entries creates `sweepstake_entries` row with `total_entries < 0`.
20. Admin entry adjustment with empty notes is rejected (validation error).
21. Admin entry adjustment with `entries = 0` is rejected (validation error).
22. `GET /api/admin/sweepstakes/[id]/export` (admin session) returns CSV with header: `user_email,display_name,total_entries,purchase_entries,non_purchase_entries,admin_entries,coupon_bonus_entries,list_price_basis_cents,amount_collected_cents,actual_order_total_cents`.
23. CSV export calls `refresh_entry_verification` RPC before querying.
24. `GET /api/admin/sweepstakes/[id]/export` with non-admin session returns 403.
25. `/profile/entries` (authenticated, active sweepstake) shows `total_entries` and source breakdown.
26. `/profile/entries` (authenticated, no active sweepstake) shows "No active sweepstake right now."
27. `/sweepstakes` renders hero with prize and countdown; "Ways to enter" section lists active sample products.
28. `/sweepstakes` with no active sweepstake renders "coming soon" message only.
29. `/sweepstakes/rules` renders static legal content with `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}` visible.
30. `/admin` dashboard renders stats cards (member count, revenue, sweepstake summary, lead capture stats).
31. `/admin` dashboard shows amber warning banner when no active sweepstake.
32. `/admin` dashboard shows recent orders table.
33. `npm run build` passes with no errors.
34. `npx tsc --noEmit` passes with 0 errors.

---

## 4. Cross-Phase Dependencies

| Decision | Phase Decided | Constraint for Phase 4B |
|---|---|---|
| Supabase clients: `client.ts`, `server.ts`, `admin.ts` | Phase 1 | All server-side DB writes and private storage access must use `adminClient`. Auth checks use `server.ts`. |
| All schema tables complete — no new migrations | Phase 1 | `sample_products`, `sweepstake_entries`, `lead_captures`, `entry_verification` all exist. No migration needed. |
| Storage buckets: `sample-products` (private), `covers` (public) | Phase 1 | Sample product files → `sample-products` bucket; covers → `covers` bucket. Signed URLs require service role. |
| `entry_source` enum: `purchase`, `non_purchase_capture`, `admin_adjustment`, `coupon_bonus` | Phase 1 | Admin adjustment must use `source = 'admin_adjustment'` exactly. |
| `/api/lead-capture` accepts `sampleProductId` in body | Phase 4A | **Confirmed present** in `src/app/api/lead-capture/route.ts`. Stores in `lead_captures.sample_product_id`. No changes needed. |
| `/api/lead-capture/confirm` redirects `sample_product` source to download page | Phase 4A | **Confirmed present** in `src/app/api/lead-capture/confirm/route.ts` — returns `{ redirect: '/free/{slug}/download?token={token}' }` for `source === 'sample_product'`. No changes needed. |
| `refreshEntryVerification()` exported from `src/lib/sweepstakes.ts` | Phase 4A | **Confirmed present and exported**. `adjustUserEntries` Server Action must import and call it. |
| `refresh_entry_verification` Postgres RPC function | Phase 4A | **Confirmed present** in `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql`. |
| Admin layout + sidebar with "Sample Products" and "Users" nav links | Phase 2 | Both links exist (placeholder pages). Phase 4B replaces the placeholder page bodies. |
| `entry_verification` materialized view with unique index on `(user_id, sweepstake_id)` | Phase 1 | View confirmed in `20240101000012_materialized_views.sql`. CONCURRENTLY refresh requires the unique index — confirmed present as `idx_entry_verification_pk`. |

---

## 5. Scope Boundaries

The following are explicitly OUT OF SCOPE for Phase 4B:

- Marketplace service detail pages (`/marketplace/[slug]`) — Phase 5.
- Admin service approval flow — Phase 5.
- Homepage hero and featured e-books section — Phase 6.
- Sitemap.xml, robots.txt, full SEO audit — Phase 6 (basic `generateMetadata()` on new Phase 4B pages IS in scope).
- Production Vercel deployment — Phase 6.
- RLS policy audit and automated test scripts — Phase 6.
- Mobile responsive audit at all breakpoints — Phase 6.
- Drawing / winner selection admin tool — not in any phase PRD.
- Legal page content finalization — static placeholder only; legal review is EXTERNAL TASK E14.
- Paginated user list beyond 50 results — Phase 4B limit is sufficient.

---

## 6. Findings

### F1 — WARN: `awardAdminAdjustment()` does not exist — use inline insert in Server Action

**Finding:** Phase 4A PRD explicitly deferred `awardAdminAdjustment()` to Phase 4B. It is absent from the current `src/lib/sweepstakes.ts`. The blueprint §4.1 mentions it by name.

**Resolution (Fortified in R6):** The `adjustUserEntries` Server Action should insert the `sweepstake_entries` row directly via `adminClient`, then call the already-exported `refreshEntryVerification()`. No new named function in `sweepstakes.ts` is needed. The Architect must not add a thin wrapper unless it provides genuine reuse value.

---

### F2 — WARN: CSV column names differ from materialized view column aliases

**Finding:** The `entry_verification` view defines `entries_list_price_basis`, `entries_amount_collected`, and `actual_order_total`. Blueprint §5.7 specifies CSV headers `list_price_basis_cents`, `amount_collected_cents`, `actual_order_total_cents`. These are different names.

**Resolution (Fortified in R7):** The export SELECT must use SQL aliases: `ev.entries_list_price_basis AS list_price_basis_cents`, `ev.entries_amount_collected AS amount_collected_cents`, `ev.actual_order_total AS actual_order_total_cents`. The materialized view must NOT be modified.

---

### F3 — WARN: `revalidateTag` called with two arguments in existing sweepstakes actions

**Finding:** `src/app/(admin)/admin/sweepstakes/actions.ts` calls `revalidateTag('active-sweepstake', {})` with a second argument. Next.js 14 `revalidateTag` accepts only one argument. This is a TypeScript error.

**Resolution:** Fix these calls to single-argument form (`revalidateTag('active-sweepstake')`, `revalidateTag('active-multiplier')`) while the Backend agent is working in this file during Phase 4B. Non-blocking housekeeping.

---

### F4 — WARN: `/sweepstakes` page is a Phase 4A placeholder stub

**Finding:** `src/app/sweepstakes/page.tsx` says "Coming in Phase 4A." It was left as a stub through Phase 4A. Phase 4B must replace it entirely with the R9 implementation.

**Resolution:** Expected. The Architect treats this as a full file replacement.

---

### F5 — WARN: `react-markdown` (or equivalent) may not be installed

**Finding:** R2 and R3 require rendering `long_description` as markdown. No markdown renderer has been audited in the codebase.

**Resolution:** Architect should check `package.json`. If no markdown renderer is present, add `react-markdown` to `dependencies`. If `@tailwindcss/typography` is also absent, add it to `devDependencies` and apply `prose` class to the rendered content.

---

### F6 — WARN: Export route should live under `/api/` tree, not admin page routes

**Finding:** The PRD R7 says `/admin/sweepstakes/[id]/export` but the blueprint §10 API map shows `GET /api/admin/sweepstakes/[id]/export`. Next.js App Router page routes cannot return non-HTML responses directly.

**Resolution (Fortified in R7):** Implement as `src/app/api/admin/sweepstakes/[id]/export/route.ts`. The admin UI button links to `/api/admin/sweepstakes/{id}/export`. This is consistent with how all other API routes are structured in the project.

---

### F7 — WARN: `/admin/users/[id]` does not exist yet — no routing conflicts

**Finding:** `src/app/(admin)/admin/users/page.tsx` exists (placeholder). No `[id]` subdirectory exists yet.

**Resolution:** No conflict. The Architect creates `src/app/(admin)/admin/users/[id]/page.tsx` as a new file. The existing `users/page.tsx` placeholder is replaced with the full search page per R5.1.

---

*End of PRD_REPORT.md — Phase 4B*
