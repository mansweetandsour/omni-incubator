# TASKS.md — Phase 6: Polish & Deploy
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy

All tasks reference SPEC.md sections. Complete tasks in order within each section — tasks marked with a dependency note must not start until the dependency is complete.

---

## [DEVOPS] Tasks

### D1 — Add `tsx` to devDependencies
**File:** `package.json`
**Action:** Add `"tsx": "^4.19.2"` to `devDependencies`.
**Verify:** `npx tsx --version` prints a version number.
**Spec ref:** SPEC.md §2, §3.38
**Prerequisite for:** D3

---

### D2 — Create static OG banner asset
**File:** `public/og-banner.png`
**Action:** Create a 1200x630px PNG branded placeholder. Minimum: solid color background + "Omni Incubator" text. Any tool acceptable (Figma, Canva, Canvas script).
**Verify:** File exists at `public/og-banner.png`, dimensions are 1200x630, file size > 1KB.
**Spec ref:** SPEC.md §3.37
**Prerequisite for:** F3, F9

---

### D3 — Create RLS audit script
**File:** `scripts/verify-rls.ts` (new)
**Action:** Implement per SPEC.md §3.31. Must accept `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars, query the 11 required tables (profiles, products, ebooks, user_ebooks, orders, subscriptions, sweepstakes, sweepstake_entries, services, sample_products, lead_submissions), and output a categorized OK/DANGER/WARNING report. Exit cleanly with a descriptive error if env vars are missing.
**Verify:** `npx tsx scripts/verify-rls.ts` runs without crashing. If env vars are missing, exits with a clear error message.
**Spec ref:** SPEC.md §3.31
**Depends on:** D1
**Prerequisite for:** D5

---

### D4 — Update vercel.json
**File:** `vercel.json`
**Action:** Add `headers` array with security headers and static asset caching per SPEC.md §3.35. Preserve existing `functions` block unchanged.
**Verify:** JSON is valid. `functions["src/app/api/webhooks/stripe/route.ts"].maxDuration` is still 60. Four security headers present on `"/(.*)"` source. Cache-Control header present on static assets source.
**Spec ref:** SPEC.md §3.35

---

### D5 — Create RLS audit runbook
**File:** `docs/runbooks/runbook-rls-audit.md` (new)
**Action:** Create a Markdown runbook documenting: (1) prerequisites — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars, (2) how to run the script (`npx tsx scripts/verify-rls.ts`), (3) how to interpret OK/DANGER/WARNING output, (4) corrective actions for each category.
**Verify:** File exists. Contains headings covering each of the 4 documented topics.
**Spec ref:** SPEC.md §3.32
**Depends on:** D3

---

### D6 — Create pre-launch checklist runbook
**File:** `docs/runbooks/pre-launch-checklist.md` (new)
**Action:** Create Markdown checklist with `- [ ]` items grouped into exactly 10 sections: Auth, E-books, Checkout, Webhooks, Downloads, Profile, Sweepstakes, Sample Product, Admin, Emails. Each section must have at minimum 3 checklist items covering the scenarios in PRD R11.
**Verify:** File exists. Contains 10 `##` headings. Contains `- [ ]` items in each section.
**Spec ref:** SPEC.md §3.36

---

## [BACKEND] Tasks

### B1 — sitemap.ts
**File:** `src/app/sitemap.ts` (new)
**Action:** Implement per SPEC.md §3.15. Import `adminClient` from `@/lib/supabase/admin`. Export default async function returning `MetadataRoute.Sitemap`. Include 8 static URLs, dynamic ebook routes (`/library/{slug}`), dynamic sample product routes (`/free/{slug}`), dynamic service routes (`/marketplace/{slug}`). Exclude all `/admin/*` and `/profile/*`.
**Verify:** `GET /sitemap.xml` returns valid XML containing `/library/` entries and static routes. Build passes.
**Spec ref:** SPEC.md §3.15

---

### B2 — robots.ts
**File:** `src/app/robots.ts` (new)
**Action:** Implement per SPEC.md §3.16. Export default function returning `MetadataRoute.Robots`. Disallow `/admin/` and `/profile/`. Include sitemap URL `https://omniincubator.org/sitemap.xml`.
**Verify:** `GET /robots.txt` returns content with `Disallow: /admin/` and `Disallow: /profile/`. Build passes.
**Spec ref:** SPEC.md §3.16

---

## [FRONTEND] Tasks

Tasks can be parallelized within the same group where no dependency note is present.

---

### F1 — Root layout metadata upgrade
**File:** `src/app/layout.tsx`
**Action:** Replace flat `metadata` export with object containing `title.default: 'Omni Incubator'`, `title.template: '%s | Omni Incubator'`, `description`, and `openGraph` with siteName and static OG image per SPEC.md §3.2. The `Metadata` import from `next` is already present.
**Verify:** `npx tsc --noEmit` passes. `metadata.title` is an object not a string.
**Spec ref:** SPEC.md §3.2
**Note:** Must be done before F3 to avoid title template conflicts.

---

### F2 — Admin layout metadata + mobile padding
**File:** `src/app/(admin)/layout.tsx`
**Action:** (a) Add `import type { Metadata } from 'next'` and `export const metadata: Metadata = { robots: { index: false, follow: false } }` per SPEC.md §3.3. (b) Change `<main className="flex-1 overflow-y-auto p-8">` to `<main className="flex-1 overflow-y-auto p-8 pt-16 md:pt-8">` per SPEC.md §3.25.
**Verify:** Build passes. Admin pages emit robots noindex. Content not obscured by mobile hamburger on small viewports.
**Spec ref:** SPEC.md §3.3, §3.25

---

### F3 — Homepage rewrite
**File:** `src/app/page.tsx`
**Action:** Complete rewrite per SPEC.md §3.1. Add `export const revalidate = 60`. Implement all 5 sections: Hero (with conditional prize callout), Featured E-books (using `ProductCard` with correct prop shape), How It Works (3-step static grid), Membership Pitch (static card with $15/mo pricing), Newsletter Callout (static, CTA to /pricing). Both data queries use `adminClient`. Include static `metadata` export.
**Verify:** `GET /` renders all 5 sections. Prize callout shows `prize_description` when active sweepstake exists; fallback text when none. `ProductCard` renders for featured ebooks. TypeScript compiles.
**Spec ref:** SPEC.md §3.1
**Depends on:** F1 (root layout must use template), D2 (OG banner asset)

---

### F4 — Library page: metadata + grid fix + mobile sidebar
**File:** `src/app/library/page.tsx`
**Action:** (a) Add static `metadata` export per SPEC.md §3.4. (b) Fix grid class from `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` to `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` per SPEC.md §3.26. (c) Replace desktop-only FilterSidebar section: add `<div className="hidden md:block">` wrapper around existing Suspense/FilterSidebar; add `<div className="md:hidden mb-4"><FilterSheetTrigger /></div>` above the product grid per SPEC.md §3.24. (d) Add index param to productCards.map and pass `priority={i < 4}` to ProductCard per SPEC.md §3.30.
**Verify:** At 375px viewport, grid renders 1 column. "Filters" button visible on mobile. Static sidebar visible on desktop. Priority prop passes to first 4 cards. TypeScript compiles.
**Spec ref:** SPEC.md §3.4, §3.24, §3.26, §3.30
**Depends on:** F5 (FilterSheetTrigger), F13 (ProductCard priority prop)

---

### F5 — Filter sheet trigger component
**File:** `src/components/library/filter-sheet-trigger.tsx` (new)
**Action:** Create `'use client'` component per SPEC.md §3.24. Import `Sheet`, `SheetContent`, `SheetTrigger`, `SheetTitle` from `@/components/ui/sheet`. Import `FilterSidebar` from `./filter-sidebar`. Import `SlidersHorizontal` from `lucide-react`. Use `useState` for open/close. Button has `h-10` height (meets 44px touch target). Sheet side is `"left"` with `w-72 overflow-y-auto`.
**Verify:** Component renders without errors. Sheet opens when button is clicked. FilterSidebar inside Sheet responds to filter changes. TypeScript compiles.
**Spec ref:** SPEC.md §3.24
**Prerequisite for:** F4

---

### F6 — Library slug page generateMetadata
**File:** `src/app/library/[slug]/page.tsx`
**Action:** Add `import type { Metadata } from 'next'`. Add `generateMetadata` async function per SPEC.md §3.5. Use already-imported `createClient`. Query `products` for `title, description, cover_image_url` by slug with `is_active=true` and `deleted_at IS NULL`. Return metadata with `title`, `description`, and `openGraph.images` using `cover_image_url` if present, else fallback `/og-banner.png`.
**Verify:** TypeScript compiles. Page has correct `<title>` and `<meta property="og:image">` when slug is valid. Returns `title: 'E-book Not Found'` when slug does not exist.
**Spec ref:** SPEC.md §3.5

---

### F7 — Pricing page metadata
**File:** `src/app/pricing/page.tsx`
**Action:** Add `import type { Metadata } from 'next'`. Add `export const metadata: Metadata = { title: 'Membership Plans', description: '...' }` per SPEC.md §3.6.
**Verify:** Page `<title>` renders as "Membership Plans | Omni Incubator". TypeScript compiles.
**Spec ref:** SPEC.md §3.6

---

### F8 — Marketplace page metadata
**File:** `src/app/marketplace/page.tsx`
**Action:** Add `import type { Metadata } from 'next'`. Add `export const metadata: Metadata = { title: 'Service Marketplace', description: '...' }` per SPEC.md §3.7.
**Verify:** Page `<title>` renders as "Service Marketplace | Omni Incubator". TypeScript compiles.
**Spec ref:** SPEC.md §3.7

---

### F9 — Marketplace slug page OG image
**File:** `src/app/marketplace/[slug]/page.tsx`
**Action:** In the existing `generateMetadata`, augment the return when service is found to add `openGraph: { images: [{ url: '/og-banner.png', width: 1200, height: 630 }] }` per SPEC.md §3.8. Keep existing `title` and `description` fields.
**Verify:** TypeScript compiles. Build passes.
**Spec ref:** SPEC.md §3.8
**Depends on:** D2

---

### F10 — Sweepstakes page generateMetadata
**File:** `src/app/sweepstakes/page.tsx`
**Action:** Add `import type { Metadata } from 'next'`. Add async `generateMetadata` function per SPEC.md §3.9 that queries `adminClient` (already imported) for active sweepstake `prize_description`. Dynamic title uses `prize_description`. Fallback title: "Enter Our Sweepstakes".
**Verify:** TypeScript compiles. When active sweepstake has prize_description, title includes it. Fallback renders correctly.
**Spec ref:** SPEC.md §3.9

---

### F11 — Static metadata on remaining pages (batch)
**Files (all independent, can be done in parallel):**
- `src/app/sweepstakes/rules/page.tsx` — title: "Official Sweepstakes Rules"
- `src/app/login/page.tsx` — title: "Sign In"
- `src/app/profile/page.tsx` — title: "My Profile", robots: { index: false }
- `src/app/profile/ebooks/page.tsx` — title: "My E-books", robots: { index: false }
- `src/app/profile/orders/page.tsx` — title: "My Orders", robots: { index: false }
- `src/app/profile/entries/page.tsx` — title: "My Entries", robots: { index: false }
- `src/app/profile/subscription/page.tsx` — title: "My Subscription", robots: { index: false }

**Action:** Add `import type { Metadata } from 'next'` and appropriate `export const metadata: Metadata` to each file. Profile pages must include `robots: { index: false }`.
**Verify:** Each page has a unique `<title>`. Profile pages have `<meta name="robots" content="noindex">`. TypeScript compiles.
**Spec ref:** SPEC.md §3.10–3.12

---

### F12 — Privacy and Terms page content rewrite
**Files:**
- `src/app/privacy/page.tsx`
- `src/app/terms/page.tsx`

**Action:** Rewrite both pages with substantive placeholder content per SPEC.md §3.33 and §3.34.
- **Privacy:** Outer wrapper `<div className="container mx-auto max-w-3xl py-16 px-4">`. `<h1>Privacy Policy</h1>`. Amber callout with placeholder notice. 5 `<section>` blocks with `<h2>`: (1) Data We Collect, (2) How We Use Your Information, (3) Third-Party Services — body must name Stripe, Supabase, Resend, Beehiiv, Rewardful, (4) Cookies and Tracking, (5) Contact Us. Each body paragraph includes `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`.
- **Terms:** Same wrapper pattern. `<h1>Terms of Service</h1>`. 6 `<section>` blocks: (1) Acceptance of Terms, (2) Description of Services, (3) Membership Terms (trial/billing/cancellation/plan switching), (4) E-book License (personal, non-commercial, non-transferable), (5) Refund Policy, (6) Limitation of Liability. Each body includes `{PLACEHOLDER — EXTERNAL TASK E14}`.
- Both pages: also add `export const metadata: Metadata` with `title: 'Privacy Policy'` and `title: 'Terms of Service'` respectively (import `Metadata` from `next`).
**Verify:** Both pages render substantive content. Both contain the exact placeholder string. `<h1>` exists. TypeScript compiles.
**Spec ref:** SPEC.md §3.33, §3.34

---

### F13 — ProductCard priority prop
**File:** `src/components/library/product-card.tsx`
**Action:** Add `priority?: boolean` to `ProductCardProps` interface. Pass `priority={priority ?? false}` to the `<Image>` component. Default is `false` — no existing call sites break.
**Verify:** TypeScript compiles. No existing usages of `ProductCard` break (prop is optional). Build passes.
**Spec ref:** SPEC.md §3.30
**Prerequisite for:** F4

---

### F14 — Loading skeletons (5 files — all parallel)
**Files (all new):**
- `src/app/library/loading.tsx` — skeleton: h1 bar + search bar + sort bar + sidebar skeleton (hidden md:block) + 12 card skeletons in grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
- `src/app/library/[slug]/loading.tsx` — skeleton: 1/3 + 2/3 grid layout, cover aspect-[3/4] skeleton left, title/price/body skeletons right
- `src/app/(admin)/admin/products/loading.tsx` — skeleton: h1 bar + New Product button + header row + 8 row skeletons
- `src/app/(admin)/admin/orders/loading.tsx` — skeleton: h1 bar + header row + 8 row skeletons
- `src/app/(admin)/admin/users/loading.tsx` — skeleton: h1 bar + search input + header row + 8 row skeletons

**Action:** Create all 5 files per SPEC.md §3.17–3.21. Each imports `Skeleton` from `@/components/ui/skeleton`.
**Verify:** All 5 files exist. Each renders `<Skeleton>` elements. TypeScript compiles.
**Spec ref:** SPEC.md §3.17–3.21

---

### F15 — Admin sidebar mobile responsiveness
**File:** `src/components/admin/admin-sidebar.tsx`
**Action:** Complete rewrite to `'use client'` component per SPEC.md §3.25. Keep desktop static sidebar wrapped in `<aside className="hidden md:flex ...">`. Add mobile Sheet: fixed-position `<div className="md:hidden fixed top-4 left-4 z-50">` containing Sheet with hamburger trigger. Import `Sheet`, `SheetContent`, `SheetTrigger`, `SheetTitle` from `@/components/ui/sheet`. Import `Menu` from `lucide-react`. Extract `NavLinks` inner component that accepts `onNavigate?: () => void` to close Sheet on link click.
**Verify:** Desktop (>=768px): static sidebar visible, no hamburger button. Mobile (<768px): hamburger button visible, sidebar hidden. Sheet opens on hamburger click. Nav links close Sheet on click. TypeScript compiles.
**Spec ref:** SPEC.md §3.25

---

### F16 — Admin overflow-x-auto on placeholder pages + ProductTable
**Files:**
- `src/components/admin/product-table.tsx` — wrap `<Table>` in `<div className="overflow-x-auto">`
- `src/app/(admin)/admin/orders/page.tsx` — wrap placeholder content in `<div className="overflow-x-auto">`
- `src/app/(admin)/admin/ebooks/page.tsx` — wrap placeholder content in `<div className="overflow-x-auto">`

**Action:** Per SPEC.md §3.27. Do NOT modify `admin/users/page.tsx` — it already has `overflow-x-auto`. Do NOT modify `admin/sweepstakes/page.tsx` — it already has `overflow-x-auto`.
**Verify:** `admin/orders` and `admin/ebooks` pages have `overflow-x-auto` wrapper div. `ProductTable` has `overflow-x-auto` wrapper around `<Table>`. TypeScript compiles.
**Spec ref:** SPEC.md §3.27

---

### F17 — Replace raw img in navbar-auth.tsx
**File:** `src/components/layout/navbar-auth.tsx`
**Action:** Add `import Image from 'next/image'`. Replace `<img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />` with `<Image src={avatarUrl} alt="Avatar" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />`. Check `next.config.ts` for Supabase Storage hostname in `remotePatterns` — if present, no `unoptimized` needed; if absent, add `unoptimized`. Remove `eslint-disable-next-line @next/next/no-img-element` comment.
**Verify:** No raw `<img>` in this file. ESLint passes. TypeScript compiles. Build passes.
**Spec ref:** SPEC.md §3.28

---

### F18 — Replace raw img in admin users page
**File:** `src/app/(admin)/admin/users/page.tsx`
**Action:** Add `import Image from 'next/image'`. Replace the `<img>` avatar block (~line 170, behind eslint-disable comment) with `<Image src={user.avatar_url} alt={user.display_name ?? user.email} width={32} height={32} className="h-full w-full object-cover" />`. Remove the `eslint-disable-next-line @next/next/no-img-element` comment. Apply same `unoptimized` logic as F17.
**Verify:** No raw `<img>` in this file. ESLint passes. TypeScript compiles.
**Spec ref:** SPEC.md §3.28

---

### F19 — Checkout button toast error
**File:** `src/components/billing/checkout-button.tsx`
**Action:** Add `import { toast } from 'sonner'`. In `handleClick`, after `setError(data.error ?? '...')`, add `toast.error(data.error ?? 'Checkout failed. Please try again.')`. In the network catch block, add `toast.error('Something went wrong. Please try again.')`.
**Verify:** When checkout API returns an error response, both the inline error text AND a toast notification appear. TypeScript compiles.
**Spec ref:** SPEC.md §3.22

---

### F20 — Pricing cards toast error
**File:** `src/components/billing/pricing-cards.tsx`
**Action:** Add `import { toast } from 'sonner'`. In `handleJoin`, after `setError(...)`, call `toast.error(...)` with the same message. In the catch block, add `toast.error('Something went wrong. Please try again.')`.
**Verify:** When membership checkout fails, toast appears. TypeScript compiles.
**Spec ref:** SPEC.md §3.22

---

### F21 — Profile form Loader2 icon
**File:** `src/components/profile/profile-form.tsx`
**Action:** Add `import { Loader2 } from 'lucide-react'`. Update save button: `<Button type="submit" disabled={saving}>{saving && <Loader2 className="mr-2 size-4 animate-spin" />}{saving ? 'Saving...' : 'Save Profile'}</Button>`.
**Verify:** Button shows spinner when saving is true. TypeScript compiles.
**Spec ref:** SPEC.md §3.22

---

### F22 — Sweepstake form Loader2 icon
**File:** `src/components/admin/sweepstake-form.tsx`
**Action:** Add `import { Loader2 } from 'lucide-react'`. Modify submit button: add `inline-flex items-center gap-2` to className, add `{loading && <Loader2 className="size-4 animate-spin" />}` inside button.
**Verify:** Submit button shows spinner during submission. TypeScript compiles.
**Spec ref:** SPEC.md §3.22

---

### F23 — Product form Loader2 icon (verify + fix if needed)
**File:** `src/components/admin/product-form.tsx`
**Action:** Read the submit button implementation. If `disabled={isPending}` is present and a `<Loader2>` spinner already renders when `isPending === true`, no change needed — mark PASS. If spinner is absent, add `import { Loader2 } from 'lucide-react'` and add `{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}` to the submit button.
**Verify:** Submit button is disabled and shows spinner while the Server Action transition is in flight. TypeScript compiles.
**Spec ref:** SPEC.md §3.22

---

### F24 — Error page "Go home" link
**File:** `src/app/error.tsx`
**Action:** Add `import Link from 'next/link'`. Add below the "Try again" button:
```tsx
<Link href="/" className="text-sm text-zinc-500 underline underline-offset-4 hover:no-underline">
  Go home
</Link>
```
**Verify:** Error page renders both "Try again" and "Go home". TypeScript compiles.
**Spec ref:** SPEC.md §3.23

---

## Execution Order

```
Parallel group A (no dependencies — start immediately):
  D1, D2, D4, D6, B1, B2, F1, F2, F5, F13, F14, F15, F16, F17, F18, F19, F20, F21, F22, F23, F24
  F7, F8, F9 (F9 depends on D2 only), F10, F11, F12

After D1:
  D3 → D5

After F1:
  F3 (also depends on D2)

After F5 AND F13:
  F4

After F15:
  F2 (F2 depends on F15 for the mobile padding context — can parallelize if implementor reads both)

Final verification (all tasks complete):
  npm run build
  npx tsc --noEmit
  npx vitest run
```
