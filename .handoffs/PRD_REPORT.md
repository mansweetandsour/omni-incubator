# PRD_REPORT.md — Phase 6: Polish & Deploy
**PRD Agent Output — Fortification Mode**
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy

---

## 1. Status

**WARN**

Requirements are complete, consistent, and achievable. The Architect may proceed. Several items claimed as pre-built are either missing or incomplete; the Architect must build or complete them rather than simply verify. One structural inconsistency in R6 (admin sidebar mobile claim) requires new work. All acceptance criteria are achievable within the existing codebase architecture.

---

## 2. Fortified Requirements

### R1 — Homepage (Server Component, ISR revalidate: 60)

Replace `/` (`src/app/page.tsx`) — currently a two-line placeholder — with a full server component homepage. Export `export const revalidate = 60`.

**Sections (required, top to bottom):**

1. **Hero** — Headline: "Build, Launch, and Grow — Join the Omni Incubator". One-sentence subheadline covering membership + e-books + sweepstakes. Two CTA buttons: "Browse the Library" → `/library`, "Join Now" → `/pricing`. Prize callout: if an active sweepstake exists, display "🎟️ Win {prize_description} — No purchase necessary"; if none, display "Enter our next sweepstake — coming soon" (static fallback text, no missing UI).

2. **Featured E-books** — Three most recently created active e-books (`type='ebook'`, `is_active=true`, `deleted_at IS NULL`, `ORDER BY created_at DESC`, `LIMIT 3`). Rendered using the existing `ProductCard` component (`src/components/library/product-card.tsx`). If fewer than 3 active e-books exist, render what is available without error.

3. **How It Works** — Static three-step grid: "Join" → "Learn" → "Win", each with a short description. No data fetching.

4. **Membership Pitch** — Static value proposition card listing member benefits, "$15/mo or $129/yr" pricing, "Start free trial" CTA → `/pricing`.

5. **Newsletter Callout** — Heading "Join our monthly newsletter", one-sentence description (newsletter is a membership benefit). CTA → `/pricing`. No standalone subscribe form. No Beehiiv API call on this page.

**Data fetching (both using server-side Supabase client):**
- Active sweepstake: `SELECT id, prize_description FROM sweepstakes WHERE status = 'active' LIMIT 1`.
- Featured products: `SELECT id, slug, title, description, price_cents, cover_image_url, custom_entry_amount FROM products WHERE type='ebook' AND is_active=true AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 3`.

### R2 — SEO: generateMetadata on All Pages

Add `generateMetadata()` or `export const metadata` to every page currently missing it.

**Confirmed already present:**
- Root layout (`src/app/layout.tsx`) — has `export const metadata` with title and description. **Must be upgraded** to include `title.template` and a fallback OG image (see below).
- `src/app/free/[slug]/page.tsx` — has `generateMetadata` with OG image. Verified complete.
- `src/app/marketplace/[slug]/page.tsx` — has `generateMetadata` with title and description, but **no OG image**. Must be completed.

**Missing — must be added:**
- `/` — static `metadata`: site name, site description, canonical `https://omniincubator.org`, OG image (static `/og-banner.png`).
- `/library` — `metadata`: title "E-book Library | Omni Incubator", description.
- `/library/[slug]` — `generateMetadata`: product title, description, OG image (`cover_image_url`). Confirmed: zero metadata currently exists on this page (contrary to PRD assumption of Phase 2 completion).
- `/pricing` — `metadata`: title "Membership Plans | Omni Incubator".
- `/marketplace` — `metadata`: title "Service Marketplace | Omni Incubator".
- `/marketplace/[slug]` — complete existing `generateMetadata` by adding `openGraph.images` (use static `/og-banner.png` as fallback since services have no cover image column).
- `/sweepstakes` — `generateMetadata` (dynamic): query active sweepstake; title "Win {prize_description} | Omni Incubator Sweepstakes"; fallback "Enter Our Sweepstakes | Omni Incubator" if no active sweepstake.
- `/sweepstakes/rules` — `metadata`: title "Official Sweepstakes Rules | Omni Incubator".
- `/login` — `metadata`: title "Sign In | Omni Incubator".
- `/profile` and all profile sub-pages — `metadata`: title "My Profile | Omni Incubator", `robots: { index: false }`.
- `/admin/*` — all admin pages must emit `robots: { index: false, follow: false }`. Preferred: add `export const metadata` to `src/app/(admin)/layout.tsx` so it cascades automatically.

**Root layout upgrade (required):**
```ts
export const metadata: Metadata = {
  title: {
    default: 'Omni Incubator',
    template: '%s | Omni Incubator',
  },
  description: 'E-books, community, sweepstakes — everything you need to build.',
  openGraph: {
    siteName: 'Omni Incubator',
    images: [{ url: '/og-banner.png' }],
  },
}
```
The static OG banner (`public/og-banner.png`, 1200×630) must be created as a new asset. A minimal branded placeholder is sufficient for launch.

### R3 — Sitemap and robots.txt

Neither file currently exists. Both must be created.

**`src/app/sitemap.ts`** — New file. Next.js `MetadataRoute.Sitemap` function.
- Static URLs: `/`, `/library`, `/pricing`, `/marketplace`, `/sweepstakes`, `/sweepstakes/rules`, `/privacy`, `/terms`.
- Dynamic e-book pages: query `products WHERE type='ebook' AND is_active=true AND deleted_at IS NULL`, map to `/library/{slug}`.
- Dynamic sample product pages: query `sample_products WHERE is_active=true AND deleted_at IS NULL`, map to `/free/{slug}`.
- Dynamic service pages: query `services WHERE status IN ('active','approved') AND deleted_at IS NULL`, map to `/marketplace/{slug}`.
- Exclude all `/admin/*` and `/profile/*` URLs.

**`src/app/robots.ts`** — New file. Next.js `MetadataRoute.Robots` function.
- Allow all crawlers on all paths.
- Disallow: `/admin/`, `/profile/`.
- Sitemap URL: `https://omniincubator.org/sitemap.xml`.

### R4 — Loading States

No `loading.tsx` files currently exist anywhere in the codebase. All five must be created new.

**New `loading.tsx` files required:**
- `src/app/library/loading.tsx` — skeleton matching library layout: filter sidebar skeleton (`w-56 h-96`) + grid of 12 card skeletons.
- `src/app/library/[slug]/loading.tsx` — skeleton matching ebook detail layout: cover image placeholder, title bar, price bar, body text lines.
- `src/app/(admin)/admin/products/loading.tsx` — skeleton table: header row + 8 row skeletons.
- `src/app/(admin)/admin/orders/loading.tsx` — skeleton table: header row + 8 row skeletons.
- `src/app/(admin)/admin/users/loading.tsx` — skeleton table: header row + 8 row skeletons.

**Button loading spinners:** All form submission and checkout trigger buttons must show `disabled + spinner` while async action is in flight. Use shadcn Button with `disabled` prop and Lucide `Loader2` icon with `animate-spin`. Audit scope:
- Checkout buttons (e-book purchase, membership purchase, upsell).
- Profile form submit.
- Admin forms (product create/edit, sweepstake create).
- Lead capture popup form submit.
- Sweepstake entry form submit.

### R5 — Error Handling Polish

**`/not-found.tsx`** — Exists and passes: "404" heading, descriptive text, "Go home" link. No changes required.

**`/error.tsx`** — Exists and passes Sentry capture + user message. Advisory: add a "Go home" link alongside the "Try again" button (see WARN-8).

**`/403/page.tsx`** — Exists and passes: "403" heading, descriptive text, "Go home" link. No changes required.

**Toast error handling on checkout:** All `fetch()` calls to checkout API routes must catch network errors and Stripe API errors and call `toast.error()` with a user-friendly message. The user must never be left on a broken page. Audit all checkout call sites across the codebase.

### R6 — Mobile Responsiveness Audit

**Library filter sidebar:** The `FilterSidebar` component (`src/components/library/filter-sidebar.tsx`) is a static `<aside>` with fixed `w-56`. The library page renders it with no mobile breakpoints. Required: on viewports ≤768px, hide the static sidebar (`hidden md:block`) and show a "Filters" button (`md:hidden`) that opens a shadcn `Sheet` containing the filter controls. The `FilterSidebar` logic can be reused inside the Sheet.

**Admin sidebar:** `AdminSidebar` is a static `<aside>` with no responsive behavior (contrary to PRD claim of existing mobile Sheet from Phase 1). Must be made mobile-responsive: on viewports ≤768px, show a hamburger icon button that opens a shadcn `Sheet` containing the nav links. On desktop, render the existing static sidebar.

**Product card grid:** Current library grid is `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`. R6 requires 1 column on mobile. Change to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` (or equivalent). Apply consistently to the homepage featured e-books grid as well.

**Navigation hamburger:** Verify existing Navbar hamburger menu functions correctly on all pages. This is a verification task, not new work.

**Touch targets:** All interactive elements must be ≥44px height. Audit and fix violations.

**Admin table `overflow-x-auto`:**
- `admin/users/page.tsx` — already has `overflow-x-auto`. No change.
- `admin/sweepstakes/page.tsx` — already has `overflow-x-auto`. No change.
- `admin/orders/page.tsx` — MISSING. Add `overflow-x-auto` wrapper.
- `admin/products/page.tsx` (via `ProductTable` component) — MISSING. Add `overflow-x-auto` to `ProductTable` component.
- `admin/ebooks/page.tsx` — MISSING. Add `overflow-x-auto` wrapper.

### R7 — Performance

**`next/image` violations:** One confirmed raw `<img>` tag: `src/components/layout/navbar-auth.tsx` line 50 (user avatar). Must be replaced with `next/image`.

**Width/height props:** Verify all `next/image` usages have explicit `width` and `height` props, or `fill` with a positioned parent. Wrap cover images in a container with an explicit aspect ratio class (e.g. `aspect-[3/4]`) to prevent CLS.

**`priority` prop:** Add `priority` to:
- Homepage hero image.
- First 3–4 `ProductCard` instances on the library page (pass a `priority` prop to `ProductCard` and apply it conditionally).

### R8 — RLS Policy Audit Script

**`scripts/verify-rls.ts`** — New file (only `scripts/dashboard.py` currently exists).

Requirements:
- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from environment variables.
- Queries Postgres system tables (`pg_class`, `pg_namespace`, `pg_policies`) to determine RLS status and policy count per table.
- Reports three categories: (1) OK — RLS on + ≥1 policy, (2) DANGER — RLS on + 0 policies (locked out), (3) WARNING — RLS off (open).
- Minimum table list: `profiles`, `products`, `ebooks`, `user_ebooks`, `orders`, `subscriptions`, `sweepstakes`, `sweepstake_entries`, `services`, `sample_products`, `lead_submissions`.
- Runnable via `npx tsx scripts/verify-rls.ts`. Verify `tsx` is in `devDependencies`; add if missing.

**Runbook:** Create `docs/runbooks/runbook-rls-audit.md` documenting how to run the script and interpret output.

### R9 — Privacy and Terms Pages

Both pages exist as "Coming in Phase 6." placeholders. Replace with substantive placeholder content.

**`/privacy`** — Cover: (1) data collected, (2) how used, (3) third-party services (Stripe, Supabase, Resend, Beehiiv, Rewardful named explicitly), (4) cookies and tracking, (5) contact. Each section body must include: `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`.

**`/terms`** — Cover: (1) acceptance of terms, (2) services description, (3) membership terms (trial, billing, cancellation, plan switching), (4) e-book license (personal, non-commercial, non-transferable), (5) refund policy, (6) limitation of liability. Each section body must include: `{PLACEHOLDER — EXTERNAL TASK E14}`.

Both pages: server components, static (no data fetching), proper heading hierarchy (`h1` → `h2` → `h3`), consistent container/padding layout.

### R10 — vercel.json Finalization

Current `vercel.json` contains only `functions.maxDuration: 60` for the Stripe webhook. Preserve that and add:

**Security headers** (`source: "/(.*)"` — all routes):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`

**Static asset caching** (`source: "/(_next/static|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg)"` or equivalent):
- `Cache-Control: public, max-age=31536000, immutable`

The `functions` block must be preserved unchanged.

### R11 — Pre-launch Checklist Document

**`docs/runbooks/pre-launch-checklist.md`** — New file. Does not currently exist (5 runbook files exist; none is a pre-launch checklist).

Must be a Markdown file with `- [ ]` checkbox items grouped into 10 sections covering:
1. Auth (OTP signup, Google OAuth signup, sign in, sign out)
2. E-books (browse, filter, search, detail, preview)
3. Checkout (non-member purchase, member purchase with 50% off, membership purchase, upsell flow)
4. Webhooks (Stripe test events, verify processing)
5. Downloads (download owned e-book, verify non-owner blocked)
6. Profile (view, edit, orders, subscription, Stripe portal)
7. Sweepstakes (popup entry, confirm email, profile entries display)
8. Sample product (landing page, form submit, confirm email, download)
9. Admin (create product, upload file, sweepstake lifecycle, user management)
10. Emails (verify each transactional template sends)

---

## 3. Acceptance Criteria

1. `GET /` renders all five homepage sections: hero, featured e-books, how it works, membership pitch, newsletter callout.
2. Homepage hero displays prize callout with `prize_description` when an active sweepstake exists.
3. Homepage hero displays fallback "Enter our next sweepstake" text when no active sweepstake exists.
4. Featured e-books section renders ≤3 cards using the `ProductCard` component.
5. All 12 pages listed in R2 have `generateMetadata()` or `metadata` export.
6. Root layout `metadata.title` is an object with `default` and `template` keys.
7. `src/app/sitemap.ts` exists and `GET /sitemap.xml` returns valid XML.
8. Sitemap includes `/library/{slug}` entries for all active e-books.
9. `src/app/robots.ts` exists and `GET /robots.txt` disallows `/admin/` and `/profile/`.
10. `src/app/library/loading.tsx` exists and renders 12 card skeleton placeholders.
11. `src/app/library/[slug]/loading.tsx` exists and renders a skeleton detail layout.
12. `src/app/(admin)/admin/products/loading.tsx` exists and renders a skeleton table.
13. `src/app/(admin)/admin/orders/loading.tsx` exists and renders a skeleton table.
14. `src/app/(admin)/admin/users/loading.tsx` exists and renders a skeleton table.
15. All form submission and checkout buttons show disabled + spinner state during async actions.
16. `/not-found.tsx` renders 404 heading with homepage link. (Already passing.)
17. `/error.tsx` captures to Sentry and renders user-friendly message. (Already passing.)
18. `/403/page.tsx` renders 403 heading with homepage link. (Already passing.)
19. Checkout API call failures surface a `toast.error()` message; user is not stranded.
20. Library filter sidebar converts to a Sheet component on viewports ≤768px.
21. Admin sidebar renders as a Sheet or hamburger pattern on viewports ≤768px.
22. Product card grid renders 1 column on mobile (≤375px), 2 on tablet, 3–4 on desktop.
23. `admin/orders`, `admin/products`, `admin/ebooks` tables have `overflow-x-auto` wrappers.
24. No raw `<img>` tags exist (navbar-auth.tsx avatar converted to `next/image`).
25. All `next/image` usages have explicit `width`/`height` or `fill` with positioned parent.
26. Cover images have explicit aspect ratio wrappers to prevent CLS.
27. `priority` prop is set on homepage hero image and library first-row product cards.
28. `scripts/verify-rls.ts` exists and runs without crashing via `npx tsx scripts/verify-rls.ts`.
29. `docs/runbooks/runbook-rls-audit.md` exists.
30. `/privacy` renders substantive placeholder content with `{PLACEHOLDER — EXTERNAL TASK E14}` markers.
31. `/terms` renders substantive placeholder content with `{PLACEHOLDER — EXTERNAL TASK E14}` markers.
32. `vercel.json` contains security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`).
33. `vercel.json` retains `maxDuration: 60` for the Stripe webhook route.
34. `docs/runbooks/pre-launch-checklist.md` exists with ≥10 grouped checklist sections.
35. `npm run build` exits with code 0.
36. `npx tsc --noEmit` exits with 0 errors.
37. Vitest passes 7/7 (existing tests must not regress).

---

## 4. Cross-Phase Dependencies

- **Phase 1** — Auth, profiles table, RLS baseline, admin layout, `/not-found.tsx`, `/error.tsx`, `/403/page.tsx`, root layout, Navbar, Footer, Toaster (Sonner), Providers, `vercel.json` with `maxDuration: 60`. All must be preserved.
- **Phase 2** — `ProductCard` component required by R1 homepage. `FilterSidebar` component required by R6 (mobile Sheet wrapping). Library ISR pattern (`revalidate = 60`) followed by R1.
- **Phase 3** — Stripe checkout API routes exist. R5 requires toast error handling at all call sites. Stripe webhook `maxDuration: 60` in vercel.json must be preserved in R10.
- **Phase 4A** — Sweepstakes schema with `prize_description` column on `sweepstakes` table. Used by R1 homepage prize callout and R2 sweepstakes metadata.
- **Phase 4B** — `src/app/free/[slug]/page.tsx` `generateMetadata` confirmed complete. No additional work needed.
- **Phase 5** — `src/app/marketplace/[slug]/page.tsx` `generateMetadata` exists but is incomplete (missing OG image). R2 must complete it.

---

## 5. Scope Boundaries

The following are explicitly OUT OF SCOPE for Phase 6:

- Actual Vercel deployment and DNS setup (EXTERNAL TASKs E11, E12)
- Supabase production project creation (EXTERNAL TASK E1)
- Google Cloud OAuth production client (EXTERNAL TASK E3)
- Stripe live mode activation (EXTERNAL TASK E13)
- Legal review of privacy, terms, sweepstakes rules (EXTERNAL TASK E14)
- First sweepstake creation (EXTERNAL TASK E15)
- First e-book and sample product upload (EXTERNAL TASKs E16, E17)
- New database migrations — none required; all data fetching uses existing schema
- Animated homepage hero or marketing video
- A/B testing or analytics beyond existing Sentry integration
- Lighthouse audit or Core Web Vitals optimization beyond next/image and priority prop
- Dark mode audit
- Internationalization or localization
- New email templates

---

## 6. Findings

### WARN-1: Admin Sidebar Mobile Implementation Does Not Exist
**Severity:** WARN — new work required
PRD R6 states "Admin sidebar: already uses Sheet for mobile from Phase 1 — verify." Code audit of `src/components/admin/admin-sidebar.tsx` shows a static `<aside className="w-64 min-h-screen border-r ...">` with zero responsive classes, no Sheet import, and no hamburger. This is entirely new work. Acceptance criterion 21 captures the requirement. The Architect must implement this, not just verify it.

### WARN-2: Library Page Mobile Grid is 2-Column on Mobile, Not 1-Column
**Severity:** WARN — clarification/fix required
R6 specifies "1 col on mobile, 2 on tablet, 3-4 on desktop." Current library grid class is `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, which renders 2 columns at 375px. The Architect must change this to achieve 1 column on mobile. The same standard should be applied to the homepage featured e-books grid when it is built.

### WARN-3: `/library/[slug]` Has Zero Metadata (PRD Claim of Phase 2 Completion is Incorrect)
**Severity:** WARN — work item
PRD R2 states this page "already has metadata from Phase 2, verify it includes OG image." Code audit confirms zero `generateMetadata` or `metadata` exports in `src/app/library/[slug]/page.tsx`. This is new work. The Architect must add `generateMetadata()` including OG image using `cover_image_url`.

### WARN-4: `marketplace/[slug]` generateMetadata Missing OG Image
**Severity:** WARN — minor completion required
Existing `generateMetadata` returns only `title` and `description`. Services do not have a `cover_image_url` column in the current schema (Phase 5 data model). The Architect should use the static `/og-banner.png` as the OG image fallback for marketplace detail pages.

### WARN-5: Static OG Banner Asset Does Not Exist
**Severity:** WARN — new asset required
R2 requires a static OG banner image (`public/og-banner.png`, 1200×630px) for root layout metadata and marketplace fallback. No such file exists in `/public/`. The Architect must create or source this asset. A programmatically generated placeholder (e.g., a filled rectangle with site name as text) is acceptable for launch.

### WARN-6: `tsx` Dev Dependency Status Unknown
**Severity:** WARN — dependency check needed
R8 specifies running `scripts/verify-rls.ts` via `npx tsx`. The Architect must verify `tsx` is in `devDependencies` in `package.json`. If absent, add it before declaring the script runnable.

### WARN-7: Admin Orders Page is Still a Placeholder
**Severity:** WARN — scope clarification
`src/app/(admin)/admin/orders/page.tsx` currently renders "Coming in a future phase." The R4 `loading.tsx` for orders and the R6 `overflow-x-auto` requirement both target this page. The `loading.tsx` should be created regardless (it will apply when the page gains real content). The `overflow-x-auto` wrapper should be added to the table wrapper, even if the table is placeholder content, to satisfy the acceptance criterion.

### WARN-8: `error.tsx` Missing Homepage Navigation Link
**Severity:** WARN — minor UX advisory
`/error.tsx` provides "Try again" but no way to navigate to the homepage if the error is unrecoverable. Adding a "Go home" link alongside the retry button is a trivial improvement. Advisory only.

### INFO-1: Sweepstakes Metadata Column Name Clarification
**Severity:** INFO
PRD R2 uses `${prize_amount}` in the sweepstakes page metadata example. The actual schema column is `prize_description` (confirmed in BLUEPRINT and Phase 4A). The Architect must use `prize_description` in the dynamic title, not `prize_amount`.

### INFO-2: All Acceptance Criteria Are Achievable
**Severity:** INFO
All 37 acceptance criteria can be met within the existing codebase architecture. No new external services, no new database migrations, no changes to auth strategy or data models are required. Phase 6 is a pure polish/frontend/documentation phase.

---

*PRD Agent — Fortification complete. Status: WARN. Architect may proceed.*
