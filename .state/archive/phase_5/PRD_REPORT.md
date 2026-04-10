# PRD_REPORT.md — Phase 5: Marketplace Shell
**PRD Agent Output — Fortification Mode**
**Date:** 2026-04-09
**Phase:** 5 — Marketplace Shell

---

## 1. Status

**WARN**

Requirements are complete and implementable. Two WARN findings are raised that the Architect must address before implementation begins. Neither is a blocker — both have clear, trivial resolutions.

---

## 2. Fortified Requirements

### R1 — Service Detail Page (`/marketplace/[slug]`)

- Route: `/marketplace/[slug]`, server component, `export const revalidate = 60`.
- Fetch service by `slug` using `adminClient`. If no service found: `notFound()`. If `deleted_at IS NOT NULL`: `notFound()`.
- Visibility gate: if `status IN ('pending', 'suspended')`: `notFound()` for public users. Only `status = 'active'` OR `status = 'approved'` renders a page.
- Provider fetch: if `provider_id IS NOT NULL`, join or separately query `profiles` for `display_name`. May be done in a single query via PostgREST join: `.select('*, profiles!provider_id(display_name)')`.
- Page content (always rendered for visible services, behind overlay when `is_coming_soon = true`):
  - Service `title` as `<h1>`.
  - Service `description` as a short paragraph (plain text).
  - Service `long_description` rendered as Markdown. Use `react-markdown` + `remark-gfm` (both already installed from Phase 4B). Render inside a `<div className="prose prose-zinc max-w-none dark:prose-invert">` wrapper — the `.prose` utility class is already in `globals.css` from Phase 4B.
  - Provider info: if `provider_id` is set, render "By [display_name]". Omit entirely if `provider_id` is null.
  - Rate display — checked in this order (first match wins):
    1. If `rate_label` is set (non-null, non-empty string): display `rate_label` verbatim.
    2. Else if `rate_type = 'custom'` OR `rate_cents IS NULL`: display "Contact for pricing".
    3. Else display formatted amount with suffix based on `rate_type`:
       - `hourly` → formatted dollars + "/hr"
       - `fixed` → formatted dollars + " fixed"
       - `monthly` → formatted dollars + "/mo"
       - Dollar format: `(rate_cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })` — no cents when amount is whole dollars.
  - `category` rendered as a `<Badge variant="secondary">`.
  - `tags` (array): each rendered as a `<Badge variant="outline">` if `tags.length > 0`.
  - Entry badge: if `custom_entry_amount IS NOT NULL AND custom_entry_amount > 0`: render `<EntryBadge product={{ price_cents: 0, custom_entry_amount: service.custom_entry_amount }} />` wrapped in `<Suspense fallback={null}>`. **See WARN-1 — requires new migration to add `custom_entry_amount` column to services table.**
  - Coming Soon overlay: if `is_coming_soon = true`, render a semi-transparent overlay covering the full page content below the hero section. The overlay must include a "Coming Soon" heading and the CTA button.
  - CTA button: labeled "Coming Soon — Join the waitlist". Clicking this button reveals an inline `<LeadCaptureForm source="marketplace_coming_soon" />` rendered below the button within the overlay. The `LeadCaptureForm` is a `'use client'` component and supports `marketplace_coming_soon` source already. The toggle (show/hide form on CTA click) is implemented as a small `'use client'` wrapper component.
  - `generateMetadata()`: `title = service.title`, `description = service.description ?? ''`.

### R2 — Entry Badge on Marketplace Service Cards (`/marketplace`)

- Update `src/app/marketplace/page.tsx` (Phase 2 file).
- Update the Supabase query to also fetch `custom_entry_amount` per service: `.select('id, title, description, category, is_coming_soon, custom_entry_amount')`.
- On each service card: if `service.custom_entry_amount` is non-null and `> 0`, render `<EntryBadge product={{ price_cents: 0, custom_entry_amount: service.custom_entry_amount }} />` wrapped in `<Suspense fallback={null}>`, placed beneath the service description and above the category badge.
- No other changes to the marketplace page layout.
- **See WARN-1 — requires the migration from R1 to be in place first.**

### R3 — Admin Service Approval Workflow

**R3.1 — Admin service edit form (`ServiceForm` in `src/components/admin/service-form.tsx`)**

The `ServiceForm` component already has a `status` select (edit mode only) and an `is_coming_soon` checkbox. The following changes are needed:
- **Status dropdown options**: replace current options (`pending`, `active`, `paused`) with: `pending`, `approved`, `active`, `suspended`. Note: the value `paused` does not appear in the DB schema — this is an existing bug. Correct values are `pending`, `approved`, `active`, `suspended`.
- **Current status badge**: display a color-coded `<Badge>` alongside the status label showing the current value. Colors: `pending` → yellow/amber; `approved` → blue; `active` → green; `suspended` → red.
- **`is_coming_soon` toggle**: already present and functional — no changes needed.
- **`custom_entry_amount` field**: add an optional integer input for `custom_entry_amount`. Label: "Entry Amount (optional)". Client-side validation: if filled, must be ≥ 1. Send as `custom_entry_amount` in `FormData`. **See WARN-1.**

**R3.2 — `updateService` Server Action (`src/app/actions/services.ts`)**

The existing `updateService` already reads and updates `status` and `is_coming_soon`. Extend it to also read and update `custom_entry_amount`:
- Extract `custom_entry_amount`: `const cea_str = formData.get('custom_entry_amount')?.toString()`. If empty string or absent, set `custom_entry_amount = null`. If present, parse as integer; if not a positive integer, return `{ error: 'Entry amount must be a positive integer' }`.
- Include `custom_entry_amount` in the `adminClient.update({...})` call.

Add a new export `approveService(id: string): Promise<{ ok: true } | { error: string }>`:
1. Admin auth check (same pattern as existing actions).
2. `adminClient.from('services').update({ status: 'approved' }).eq('id', id)`.
3. `revalidatePath('/admin/services')`.
4. Return `{ ok: true }` or `{ error: updateError.message }`.

**R3.3 — Admin services list page (`/admin/services/page.tsx`)**

- Add `searchParams: Promise<{ status?: string }>` to the page component.
- Read `status` param. Apply filter to the Supabase query:
  - If `status === 'pending'`: `.eq('status', 'pending').is('deleted_at', null)`
  - If `status === 'active'`: `.eq('status', 'active').is('deleted_at', null)`
  - Otherwise (all): `.is('deleted_at', null)` (show non-deleted only; already done via ServiceTable `deleted_at` check)
- Render filter UI above the table: three buttons/links "All", "Pending approval", "Active" — each is an `<a>` or `<Link>` to `?status=pending`, `?status=active`, and base URL respectively. Highlight active filter.
- Pass `services` (pre-filtered) to `<ServiceTable>`.
- The `ServiceTable` component already renders status badges. Augment it to show an "Approve" button on rows with `status === 'pending'`.

**R3.4 — `ServiceTable` component (`src/components/admin/service-table.tsx`)**

- Add "Approve" button per pending row. This is a client component action — create a small `<ServiceApproveButton serviceId={id} />` client component that calls `approveService(id)` via `useTransition`, shows loading state, and calls `toast.success('Service approved')` on success.
- The `ServiceTable` already uses client-side state for archive — the same pattern applies for approve.
- No changes to status badge colors — current `<Badge variant="secondary">` for status is acceptable; the Architect may optionally add color variants consistent with the edit form badge.

---

## 3. Acceptance Criteria

1. `GET /marketplace/[slug]` with `status='active'`, `deleted_at IS NULL` → HTTP 200, page renders with service content.
2. `GET /marketplace/[slug]` with `status='approved'`, `deleted_at IS NULL` → HTTP 200, page renders.
3. `GET /marketplace/[slug]` with `status='pending'` → HTTP 404.
4. `GET /marketplace/[slug]` with `status='suspended'` → HTTP 404.
5. `GET /marketplace/[slug]` with `deleted_at` set → HTTP 404.
6. Service detail page: when `rate_label` is set → `rate_label` text displayed. When `rate_type='custom'` with no `rate_label` → "Contact for pricing" displayed. When `rate_type='hourly'`, `rate_cents=15000`, no `rate_label` → "$150/hr" displayed. When `rate_type='fixed'`, `rate_cents=250000`, no `rate_label` → "$2,500 fixed" displayed. When `rate_type='monthly'`, `rate_cents=50000`, no `rate_label` → "$500/mo" displayed.
7. Service detail page renders `long_description` as Markdown inside `.prose` wrapper.
8. Service detail page shows "By [display_name]" when `provider_id` is set; provider section absent when `provider_id` is null.
9. Service detail page: `is_coming_soon=true` → Coming Soon overlay visible with CTA button.
10. Clicking "Coming Soon — Join the waitlist" CTA on detail page → inline `<LeadCaptureForm source="marketplace_coming_soon" />` appears.
11. Service detail page: `custom_entry_amount > 0` → `<EntryBadge>` renders.
12. Marketplace service card: `custom_entry_amount > 0` → `<EntryBadge>` renders on card.
13. Admin services list: status filter "Pending approval" → shows only `status='pending'` services. "Active" → shows only `status='active'`. "All" → shows all non-deleted.
14. Admin services list: rows with `status='pending'` show "Approve" button.
15. Clicking "Approve" button → `approveService` Server Action called, service status updated to `'approved'`, list revalidates.
16. Admin service edit form status dropdown contains: `pending`, `approved`, `active`, `suspended`.
17. Admin service edit form shows current-status color badge alongside status dropdown.
18. Admin service edit form has `custom_entry_amount` field; saving with a value persists it to DB.
19. `npx tsc --noEmit` → 0 errors.
20. `npm run build` → exits 0.

---

## 4. Cross-Phase Dependencies

| Decision | Phase | Constraint |
|---|---|---|
| `services` table schema: `id, slug, title, description, long_description, rate_type (enum), rate_cents, rate_label, category, tags, status, is_coming_soon, provider_id, deleted_at` | Phase 1 | `custom_entry_amount` NOT present — WARN-1 requires new migration |
| `service_rate_type` DB enum: `hourly, fixed, monthly, custom` | Phase 1 | ServiceForm options `project`/`retainer` are wrong — WARN-2 fix required |
| `EntryBadge` async server component: `{ price_cents, custom_entry_amount }` props | Phase 4A | Must be wrapped in `<Suspense fallback={null}>` at each usage site |
| `LeadCaptureForm` client component: supports `source='marketplace_coming_soon'` | Phase 4A | Already in type union — no changes to component |
| `.prose` CSS utility in `globals.css` | Phase 4B | Available for Markdown rendering on detail page |
| Admin auth in Server Actions: `createClient()` + profile role check | Phase 1 | `approveService` must follow same pattern as existing actions |
| URL search param filter pattern: `searchParams: Promise<{ key?: string }>` | Phase 4B | Consistent with admin users page — same pattern for status filter |
| `revalidatePath()` for admin list cache invalidation | Phase 2+ | Call `revalidatePath('/admin/services')` in `approveService` |

---

## 5. Scope Boundaries

**OUT of scope for Phase 5:**
- Service booking, inquiry form, or any purchase/checkout flow for services.
- Service provider registration or provider-facing portal.
- Email notifications to providers or admins on status change.
- Removing `is_coming_soon` from services site-wide — that is a future operational action, not a code change.
- Homepage hero updates — Phase 6.
- Full SEO pass (OG images, sitemap, robots.txt) — Phase 6.
- Rating, review, or social proof on service cards.
- Pagination on the public marketplace page.
- Service search or category filtering on the public marketplace page.
- Admin service create form changes (only edit form and list are in scope).

---

## 6. Findings

### WARN-1: `services` table missing `custom_entry_amount` column

**Source:** `supabase/migrations/20240101000004_services.sql` — confirmed no `custom_entry_amount` column.

The PRD requires that services can show an entry badge when `custom_entry_amount > 0`. The `EntryBadge` component's `product` prop type is `{ price_cents: number; custom_entry_amount: number | null }`. Without this column, querying it will return `undefined`, TypeScript will error, and the feature cannot work.

**Required Architect action:** Add migration `supabase/migrations/20240101000019_services_custom_entry_amount.sql`:
```sql
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS custom_entry_amount INTEGER;
```
Also add `custom_entry_amount` to:
- Admin edit form (`ServiceForm`) — input field
- `updateService` Server Action — read + write
- Marketplace page query — select field
- Marketplace `[slug]` page query — select field

This is a trivial additive migration with no risk to existing data.

---

### WARN-2: `service_rate_type` enum mismatch with `ServiceForm` options

**Source:** DB enum in `20240101000001_enums.sql` defines `service_rate_type AS ENUM ('hourly', 'fixed', 'monthly', 'custom')`. The `ServiceForm` select has options `hourly`, `project`, `retainer`, `custom` (lines ~146 of `service-form.tsx`). The values `project` and `retainer` do not exist in the enum.

Any service with `rate_type='project'` or `rate_type='retainer'` will fail to insert or update with a Postgres type constraint error. This is a pre-existing Phase 2 bug.

**Required Architect action:** Update `ServiceForm` select options to match the DB enum: `hourly`, `fixed`, `monthly`, `custom`. Also update:
- `formatRate()` in `ServiceTable` — currently handles only `custom` explicitly; add case for `monthly` (e.g., `$X/mo`) and `fixed` (e.g., `$X fixed`).
- Rate display on `/marketplace/[slug]` (R1 above already accounts for this correctly).

No DB migration is needed — the enum values are correct in the DB. Only the UI options need correction.

---

### INFO: Admin service edit form already has `status` and `is_coming_soon` fields

`ServiceForm` already renders a `status` select (edit mode, lines ~213-230) and `is_coming_soon` checkbox. Phase 5 augments these — no rebuild required.

---

### INFO: `updateService` action already handles `status` and `is_coming_soon`

Lines 115-117 of `src/app/actions/services.ts` already read and pass `status` and `is_coming_soon` to the DB update. Only `custom_entry_amount` and the new `approveService` export need to be added.

---

### INFO: `ServiceTable` already shows status badges

The existing `ServiceTable` renders `<Badge variant="secondary">{service.status ?? 'pending'}</Badge>` — AC-12 (status badge on each row) is already satisfied. Phase 5 only adds the filter UI and Approve button.

---

*End of PRD_REPORT.md — Phase 5*
