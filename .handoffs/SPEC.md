# SPEC.md — Phase 6: Polish & Deploy
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy

---

## 1. Overview

Phase 6 is a pure polish, SEO, and pre-launch hardening phase. No new database migrations are required. The work falls into 11 requirement groups:

- R1: Full homepage (replaces two-line placeholder)
- R2: SEO metadata on all pages
- R3: sitemap.ts and robots.ts
- R4: loading.tsx skeleton files + button spinner audit
- R5: Error handling polish
- R6: Mobile responsiveness audit and fixes
- R7: next/image compliance and CLS prevention
- R8: RLS audit script
- R9: Privacy and Terms pages (substantive placeholder content)
- R10: vercel.json security headers and caching
- R11: Pre-launch checklist runbook doc

All acceptance criteria from `PRD_REPORT.md` (AC 1–37) are addressed.

---

## 2. Stack and Libraries

No new npm production packages are required.

| Purpose | Package | Status |
|---|---|---|
| Sheet component | `@/components/ui/sheet` | Already installed (used in mobile-nav) |
| Skeleton component | `@/components/ui/skeleton` | Already installed |
| Lucide icons | `lucide-react` | Already installed |
| next/image | `next/image` | Built-in |
| tsx (RLS script runner) | `tsx` | **NOT in devDependencies — must be added** |

**Action required:** Add `tsx` to `devDependencies` in `package.json`:
```json
"tsx": "^4.19.2"
```

---

## 3. New and Modified Files

### 3.1 R1 — Homepage: `src/app/page.tsx`

**Change type:** Complete rewrite (currently a two-line placeholder).

**Pattern:** Async server component, `export const revalidate = 60`.

**Data fetching** (server-side Supabase client — `createClient` from `@/lib/supabase/server` AND `adminClient` from `@/lib/supabase/admin`):

Use `adminClient` for both queries (no user session needed):

```ts
// Query 1: active sweepstake
const { data: activeSweepstake } = await adminClient
  .from('sweepstakes')
  .select('id, prize_description')
  .eq('status', 'active')
  .limit(1)
  .maybeSingle()

// Query 2: featured ebooks
const { data: featuredProducts } = await adminClient
  .from('products')
  .select('id, slug, title, description, price_cents, custom_entry_amount, cover_image_url, ebooks!inner(id, authors, category)')
  .eq('type', 'ebook')
  .eq('is_active', true)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
  .limit(3)
```

**Sections (top to bottom):**

**Section 1 — Hero**
- Full-width section, `py-20 px-4`, centered content, `max-w-4xl mx-auto text-center`
- `<h1>` — "Build, Launch, and Grow — Join the Omni Incubator" (`text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight`)
- `<p>` subheadline — "Unlock premium e-books, earn sweepstakes entries, and grow your business — all in one membership." (`text-lg md:text-xl text-zinc-500 mt-4 max-w-2xl mx-auto`)
- CTA buttons row (`flex flex-wrap gap-3 justify-center mt-8`):
  - "Browse the Library" → `/library` — `<Link>` with `buttonVariants({ size: 'lg' })` variant `default`
  - "Join Now" → `/pricing` — `<Link>` with `buttonVariants({ size: 'lg', variant: 'outline' })`
- Prize callout (conditional, below CTAs, `mt-6`):
  - If `activeSweepstake`: `<p className="text-sm font-medium text-amber-700 dark:text-amber-400">🎟️ Win {activeSweepstake.prize_description} — No purchase necessary</p>`
  - Else: `<p className="text-sm text-zinc-500">Enter our next sweepstake — coming soon</p>`
- No hero image. No `priority` prop needed (no image).

**Section 2 — Featured E-books**
- Section wrapper: `<section className="py-16 px-4 bg-zinc-50 dark:bg-zinc-900/50">`
- Inner: `<div className="max-w-7xl mx-auto">`
- `<h2>` — "Featured E-books" (`text-2xl md:text-3xl font-bold mb-2`)
- `<p>` — "Our most recent releases, hand-picked for you." (`text-zinc-500 mb-8`)
- Product grid: `<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">`
- Render `<ProductCard>` for each product. Pass `sweepData={null}` (no sweep data lookup on homepage, keep query count low). The `ebook` prop shape must match `ProductCard`'s expected interface:
  ```ts
  {
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description ?? null,
    price_cents: p.price_cents,
    custom_entry_amount: p.custom_entry_amount ?? null,
    cover_image_url: p.cover_image_url ?? null,
    ebook: {
      id: ebookRow.id,
      authors: ebookRow.authors ?? [],
      category: ebookRow.category ?? '',
    }
  }
  ```
  Where `ebookRow = Array.isArray(p.ebooks) ? p.ebooks[0] : p.ebooks`.
- If `featuredProducts` is empty or null, render: `<p className="text-zinc-500">Check back soon for new releases.</p>`
- No `priority` prop on these cards (they are not above the fold).

**Section 3 — How It Works**
- Static. Section wrapper: `<section className="py-16 px-4">`
- Inner: `<div className="max-w-4xl mx-auto">`
- `<h2>` — "How It Works" (`text-2xl md:text-3xl font-bold text-center mb-10`)
- Grid: `<div className="grid grid-cols-1 sm:grid-cols-3 gap-8 text-center">`
- Three steps, each:
  ```
  Step 1 — "1. Join"
    Icon: 👋 (text-4xl)
    Title: "Join" (font-semibold text-lg mt-3)
    Desc: "Create your free account and explore our membership plans." (text-sm text-zinc-500 mt-1)
  Step 2 — "2. Learn"
    Icon: 📚
    Title: "Learn"
    Desc: "Access premium e-books on business models, growth, and operations — at 50% off as a member."
  Step 3 — "3. Win"
    Icon: 🏆
    Title: "Win"
    Desc: "Every purchase earns sweepstake entries. No purchase necessary — free entry options available."
  ```

**Section 4 — Membership Pitch**
- Static. Section wrapper: `<section className="py-16 px-4 bg-zinc-50 dark:bg-zinc-900/50">`
- Inner: `<div className="max-w-2xl mx-auto rounded-2xl border bg-white dark:bg-zinc-900 p-8 md:p-12 text-center shadow-sm">`
- `<h2>` — "Become a Member" (`text-2xl md:text-3xl font-bold mb-4`)
- `<p>` — "Get 50% off all e-books, sweepstakes bonus entries, early access to new releases, and more." (`text-zinc-500 mb-6`)
- Benefits list (inline): "50% off e-books · Sweepstakes entries · Community access · Cancel anytime" (`text-sm text-zinc-600 dark:text-zinc-400 mb-6`)
- Price display: `<p className="text-3xl font-bold mb-2">$15<span className="text-xl font-normal text-zinc-500">/mo</span></p>`
- Sub-text: `<p className="text-sm text-zinc-400 mb-8">or $129/yr — save $51</p>`
- CTA: `<Link href="/pricing" className={buttonVariants({ size: 'lg' })}>Start Free Trial</Link>`
- Sub-CTA: `<p className="text-xs text-zinc-400 mt-3">7-day free trial. No credit card charge until trial ends.</p>`

**Section 5 — Newsletter Callout**
- Static. Section wrapper: `<section className="py-16 px-4">`
- Inner: `<div className="max-w-2xl mx-auto text-center">`
- `<h2>` — "Join Our Monthly Newsletter" (`text-2xl md:text-3xl font-bold mb-4`)
- `<p>` — "Member benefit: our monthly newsletter covers business ideas, e-book highlights, and member stories. Subscribe free with any membership." (`text-zinc-500 mb-6 max-w-lg mx-auto`)
- CTA: `<Link href="/pricing" className={buttonVariants({ variant: 'outline', size: 'lg' })}>Get Membership Access</Link>`
- No standalone subscribe form. No Beehiiv API call.

**Imports required:**
```ts
import { adminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ProductCard } from '@/components/library/product-card'
import type { Metadata } from 'next'
```

**Static metadata export** (added to same file):
```ts
export const metadata: Metadata = {
  title: 'Omni Incubator',
  description: 'E-books, community, sweepstakes — everything you need to build.',
  alternates: { canonical: 'https://omniincubator.org' },
  openGraph: {
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
  },
}
```

---

### 3.2 R2 — SEO: Root Layout (`src/app/layout.tsx`)

**Change type:** Modify existing `export const metadata` object only. No structural changes.

Replace current:
```ts
export const metadata: Metadata = {
  title: 'Omni Incubator',
  description: 'E-books, community, sweepstakes — everything you need to build.',
}
```

With:
```ts
export const metadata: Metadata = {
  title: {
    default: 'Omni Incubator',
    template: '%s | Omni Incubator',
  },
  description: 'E-books, community, sweepstakes — everything you need to build.',
  openGraph: {
    siteName: 'Omni Incubator',
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
  },
}
```

---

### 3.3 R2 — SEO: Admin Layout (`src/app/(admin)/layout.tsx`)

**Change type:** Add metadata export. No structural changes.

Add before the `export default` function:
```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}
```

---

### 3.4 R2 — SEO: `src/app/library/page.tsx`

**Change type:** Add static metadata export. No logic changes.

Add:
```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'E-book Library',
  description: 'Browse our full collection of premium e-books on business, operations, and growth.',
}
```

---

### 3.5 R2 — SEO: `src/app/library/[slug]/page.tsx`

**Change type:** Add `generateMetadata` function (none currently exists — new work).

Add before the `export default` function:
```ts
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export async function generateMetadata({ params }: EbookDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: product } = await supabase
    .from('products')
    .select('title, description, cover_image_url')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle()
  if (!product) return { title: 'E-book Not Found' }
  return {
    title: product.title,
    description: product.description ?? undefined,
    openGraph: {
      images: product.cover_image_url
        ? [{ url: product.cover_image_url }]
        : [{ url: '/og-banner.png', width: 1200, height: 630 }],
    },
  }
}
```

Note: `EbookDetailPageProps` is already defined in the file. The `createClient` import already exists. Only `Metadata` type import must be added.

---

### 3.6 R2 — SEO: `src/app/pricing/page.tsx`

**Change type:** Add static metadata export.

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Membership Plans',
  description: 'Join Omni Incubator and unlock 50% off all e-books, sweepstakes entries, and more. Start with a free 7-day trial.',
}
```

---

### 3.7 R2 — SEO: `src/app/marketplace/page.tsx`

**Change type:** Add static metadata export.

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Service Marketplace',
  description: 'A curated marketplace of vetted service providers to help you build, scale, and operate your business.',
}
```

---

### 3.8 R2 — SEO: `src/app/marketplace/[slug]/page.tsx`

**Change type:** Augment existing `generateMetadata` to add `openGraph.images`.

Current return (when service found):
```ts
return {
  title: service.title,
  description: service.description ?? '',
}
```

Replace with:
```ts
return {
  title: service.title,
  description: service.description ?? undefined,
  openGraph: {
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
  },
}
```

---

### 3.9 R2 — SEO: `src/app/sweepstakes/page.tsx`

**Change type:** Add `generateMetadata` function (currently none).

Add a new interface import and the function before `export default`:
```ts
import type { Metadata } from 'next'

interface SweepstakesPageMetadataProps {
  // no params needed — sweepstakes page has no dynamic segment
}

export async function generateMetadata(): Promise<Metadata> {
  const { data: activeSweepstake } = await adminClient
    .from('sweepstakes')
    .select('prize_description')
    .eq('status', 'active')
    .maybeSingle()
  if (activeSweepstake?.prize_description) {
    return {
      title: `Win ${activeSweepstake.prize_description} | Omni Incubator Sweepstakes`,
      description: `Enter for a chance to win ${activeSweepstake.prize_description}. No purchase necessary.`,
    }
  }
  return {
    title: 'Enter Our Sweepstakes',
    description: 'Enter Omni Incubator sweepstakes for a chance to win. No purchase necessary.',
  }
}
```

Note: `adminClient` is already imported at the top of this file.

---

### 3.10 R2 — SEO: `src/app/sweepstakes/rules/page.tsx`

**Change type:** Add static metadata export.

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Official Sweepstakes Rules',
  description: 'Official rules for the Omni Incubator sweepstakes. No purchase necessary to enter.',
}
```

---

### 3.11 R2 — SEO: `src/app/login/page.tsx`

**Change type:** Add static metadata export.

```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to your Omni Incubator account.',
}
```

---

### 3.12 R2 — SEO: Profile pages

All profile pages must have `robots: { index: false }`. Since `/profile` pages are under `src/app/profile/`, there is no shared layout file for this group. Add individual metadata exports to each profile page.

**Files to modify:**
- `src/app/profile/page.tsx`
- `src/app/profile/ebooks/page.tsx`
- `src/app/profile/orders/page.tsx`
- `src/app/profile/entries/page.tsx`
- `src/app/profile/subscription/page.tsx`

Add to each:
```ts
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Profile',
  robots: { index: false },
}
```

Sub-pages can use more descriptive titles:
- ebooks: `title: 'My E-books'`
- orders: `title: 'My Orders'`
- entries: `title: 'My Entries'`
- subscription: `title: 'My Subscription'`

---

### 3.13 R2 — SEO: `src/app/privacy/page.tsx`

Add:
```ts
export const metadata: Metadata = {
  title: 'Privacy Policy',
}
```

### 3.14 R2 — SEO: `src/app/terms/page.tsx`

Add:
```ts
export const metadata: Metadata = {
  title: 'Terms of Service',
}
```

---

### 3.15 R3 — Sitemap: `src/app/sitemap.ts`

**New file.**

```ts
import type { MetadataRoute } from 'next'
import { adminClient } from '@/lib/supabase/admin'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE = 'https://omniincubator.org'

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, priority: 1.0, changeFrequency: 'daily' },
    { url: `${BASE}/library`, priority: 0.9, changeFrequency: 'daily' },
    { url: `${BASE}/pricing`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${BASE}/marketplace`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${BASE}/sweepstakes`, priority: 0.8, changeFrequency: 'daily' },
    { url: `${BASE}/sweepstakes/rules`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${BASE}/privacy`, priority: 0.2, changeFrequency: 'monthly' },
    { url: `${BASE}/terms`, priority: 0.2, changeFrequency: 'monthly' },
  ]

  const [{ data: ebooks }, { data: sampleProducts }, { data: services }] = await Promise.all([
    adminClient
      .from('products')
      .select('slug, updated_at')
      .eq('type', 'ebook')
      .eq('is_active', true)
      .is('deleted_at', null),
    adminClient
      .from('sample_products')
      .select('slug, updated_at')
      .eq('is_active', true)
      .is('deleted_at', null),
    adminClient
      .from('services')
      .select('slug, updated_at')
      .in('status', ['active', 'approved'])
      .is('deleted_at', null),
  ])

  const ebookRoutes: MetadataRoute.Sitemap = (ebooks ?? []).map((p) => ({
    url: `${BASE}/library/${p.slug}`,
    lastModified: p.updated_at ?? undefined,
    priority: 0.7,
    changeFrequency: 'weekly',
  }))

  const sampleRoutes: MetadataRoute.Sitemap = (sampleProducts ?? []).map((p) => ({
    url: `${BASE}/free/${p.slug}`,
    lastModified: p.updated_at ?? undefined,
    priority: 0.6,
    changeFrequency: 'weekly',
  }))

  const serviceRoutes: MetadataRoute.Sitemap = (services ?? []).map((s) => ({
    url: `${BASE}/marketplace/${s.slug}`,
    lastModified: s.updated_at ?? undefined,
    priority: 0.6,
    changeFrequency: 'weekly',
  }))

  return [...staticRoutes, ...ebookRoutes, ...sampleRoutes, ...serviceRoutes]
}
```

---

### 3.16 R3 — Robots: `src/app/robots.ts`

**New file.**

```ts
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/profile/'],
      },
    ],
    sitemap: 'https://omniincubator.org/sitemap.xml',
  }
}
```

---

### 3.17 R4 — Loading: `src/app/library/loading.tsx`

**New file.**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function LibraryLoading() {
  return (
    <div className="container mx-auto py-10 px-4">
      <Skeleton className="h-9 w-48 mb-6" />
      <div className="flex flex-wrap items-center gap-3 mb-8">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-36" />
      </div>
      <div className="flex gap-8">
        {/* Sidebar skeleton */}
        <Skeleton className="hidden md:block w-56 h-96 shrink-0" />
        {/* Grid skeleton */}
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border overflow-hidden">
              <Skeleton className="w-full aspect-[3/4]" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-4 w-12 mt-1" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

### 3.18 R4 — Loading: `src/app/library/[slug]/loading.tsx`

**New file.**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function EbookDetailLoading() {
  return (
    <div className="container mx-auto py-12 px-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
        {/* Cover placeholder */}
        <div className="md:col-span-1">
          <Skeleton className="w-full aspect-[3/4] rounded-lg" />
        </div>
        {/* Detail placeholder */}
        <div className="md:col-span-2 space-y-6">
          <div className="space-y-3">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-9 w-3/4" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-16 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="rounded-lg border p-5 space-y-3">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

### 3.19 R4 — Loading: `src/app/(admin)/admin/products/loading.tsx`

**New file.**

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminProductsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-x-auto">
        <div className="w-full">
          <div className="flex gap-4 border-b pb-3 mb-3">
            {['w-1/3', 'w-24', 'w-20', 'w-20', 'w-28', 'w-20'].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b last:border-0">
              {['w-1/3', 'w-24', 'w-20', 'w-20', 'w-28', 'w-20'].map((w, j) => (
                <Skeleton key={j} className={`h-4 ${w}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

### 3.20 R4 — Loading: `src/app/(admin)/admin/orders/loading.tsx`

**New file.** Same skeleton table pattern as products loading:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminOrdersLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-24" />
      <div className="overflow-x-auto">
        <div className="w-full">
          <div className="flex gap-4 border-b pb-3 mb-3">
            {['w-24', 'w-32', 'w-20', 'w-20', 'w-28'].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b last:border-0">
              {['w-24', 'w-32', 'w-20', 'w-20', 'w-28'].map((w, j) => (
                <Skeleton key={j} className={`h-4 ${w}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

### 3.21 R4 — Loading: `src/app/(admin)/admin/users/loading.tsx`

**New file.** Same skeleton table pattern:

```tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function AdminUsersLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-9 w-80" />
      <div className="overflow-x-auto">
        <div className="w-full">
          <div className="flex gap-4 border-b pb-3 mb-3">
            {['w-32', 'w-48', 'w-20', 'w-24', 'w-28'].map((w, i) => (
              <Skeleton key={i} className={`h-4 ${w}`} />
            ))}
          </div>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-4 py-3 border-b last:border-0">
              {['w-32', 'w-48', 'w-20', 'w-24', 'w-28'].map((w, j) => (
                <Skeleton key={j} className={`h-4 ${w}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

---

### 3.22 R4 — Button Spinner Audit

**Findings after code review:**

| Component | File | Current State | Action Required |
|---|---|---|---|
| `CheckoutButton` | `src/components/billing/checkout-button.tsx` | Has `disabled={loading}` + `<Loader2 animate-spin>` | PASS — no change |
| `PricingCards` join button | `src/components/billing/pricing-cards.tsx` | Has `disabled={loading}` + `<Loader2>` | PASS — no change |
| `ProfileForm` save button | `src/components/profile/profile-form.tsx` | Has `disabled={saving}` but text says "Saving..." — no Loader2 icon | MINOR FAIL — add Loader2 |
| `LeadCaptureForm` submit | `src/components/sweepstakes/LeadCapturePopup.tsx` | Has `disabled={state === 'loading'}` with inline SVG spinner | PASS — acceptable |
| `SweepstakeForm` submit | `src/components/admin/sweepstake-form.tsx` | Has `disabled={loading}` but only text "Saving…", no icon | MINOR FAIL — add Loader2 |
| `ProductForm` submit | `src/components/admin/product-form.tsx` | Uses `useTransition` + `isPending` — must verify button uses `disabled={isPending}` | VERIFY |

**Changes required:**

**`src/components/profile/profile-form.tsx`** — Modify save button:
```tsx
// Before:
<Button type="submit" disabled={saving}>
  {saving ? 'Saving...' : 'Save Profile'}
</Button>

// After (add Loader2 import from lucide-react):
import { Loader2 } from 'lucide-react'
...
<Button type="submit" disabled={saving}>
  {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
  {saving ? 'Saving...' : 'Save Profile'}
</Button>
```

**`src/components/admin/sweepstake-form.tsx`** — Modify submit button:
```tsx
// Add to import block at top:
import { Loader2 } from 'lucide-react'
...
// Replace button content:
<button type="submit" disabled={loading} className="px-4 py-2 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 disabled:opacity-50 inline-flex items-center gap-2">
  {loading && <Loader2 className="size-4 animate-spin" />}
  {loading ? 'Saving…' : sweepstake ? 'Save Changes' : 'Create Sweepstake'}
</button>
```

**`src/components/admin/product-form.tsx`** — Verify the submit button uses `isPending` for disabled state. If the current implementation does not show a spinner, add Loader2 icon to the submit button.

**Checkout toast error handling** — `CheckoutButton` sets `setError` inline but does NOT call `toast.error()`. Per AC 19, the user must see a toast on checkout failure. Modify `CheckoutButton`:
```tsx
// Add import:
import { toast } from 'sonner'
...
// In handleClick catch block, replace setError(...) with:
const msg = data?.error ?? 'Checkout failed. Please try again.'
setError(msg)
toast.error(msg)
```
Same pattern for the network error catch.

`PricingCards` similarly sets `setError` without `toast.error`. Modify:
```tsx
import { toast } from 'sonner'
...
// In handleJoin, after setError:
toast.error(data.error ?? 'Failed to start checkout. Please try again.')
```

---

### 3.23 R5 — Error Handling Polish: `src/app/error.tsx`

**Change type:** Minor — add "Go home" link per WARN-8.

```tsx
// Add Link import:
import Link from 'next/link'

// Add below the "Try again" button:
<Link href="/" className="text-sm text-zinc-500 underline underline-offset-4 hover:no-underline">
  Go home
</Link>
```

---

### 3.24 R6 — Mobile: Library Filter Sidebar

**Files to modify:**
- `src/app/library/page.tsx` — wrap sidebar in responsive container
- `src/components/library/filter-sidebar.tsx` — no JSX changes required; the component is reusable as-is

**`src/app/library/page.tsx`** — Replace the sidebar section within the flex container:

```tsx
// Before:
<div className="flex gap-8">
  {/* Filter sidebar */}
  <Suspense fallback={<Skeleton className="w-56 h-96" />}>
    <FilterSidebar />
  </Suspense>
  ...
</div>

// After:
// 1. Add new import at top of file:
import { FilterSheetTrigger } from '@/components/library/filter-sheet-trigger'

// 2. Replace sidebar section:
<div className="flex gap-8">
  {/* Desktop filter sidebar — hidden on mobile */}
  <div className="hidden md:block">
    <Suspense fallback={<Skeleton className="w-56 h-96" />}>
      <FilterSidebar />
    </Suspense>
  </div>

  {/* Mobile filter button — shown only on mobile */}
  <div className="md:hidden mb-4">
    <FilterSheetTrigger />
  </div>

  {/* Product grid */}
  ...
</div>
```

**New file: `src/components/library/filter-sheet-trigger.tsx`**

This is a new `'use client'` component that renders the "Filters" button and wraps `FilterSidebar` in a `Sheet`.

```tsx
'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { FilterSidebar } from './filter-sidebar'
import { SlidersHorizontal } from 'lucide-react'

export function FilterSheetTrigger() {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-input bg-background text-sm font-medium hover:bg-muted transition-colors"
          aria-label="Open filters"
        >
          <SlidersHorizontal className="size-4" />
          Filters
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 pt-8 overflow-y-auto">
        <SheetTitle className="sr-only">Filter e-books</SheetTitle>
        <FilterSidebar />
      </SheetContent>
    </Sheet>
  )
}
```

---

### 3.25 R6 — Mobile: Admin Sidebar

**Files to modify:**
- `src/components/admin/admin-sidebar.tsx` — complete rewrite to add mobile Sheet support
- `src/app/(admin)/layout.tsx` — add mobile hamburger trigger slot

**`src/components/admin/admin-sidebar.tsx`** — Rewrite. Convert to `'use client'` component. Keep the static desktop sidebar (`hidden md:flex`). Add mobile Sheet with hamburger trigger.

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/ebooks', label: 'E-books' },
  { href: '/admin/sample-products', label: 'Sample Products' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/sweepstakes', label: 'Sweepstakes' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/settings', label: 'Settings' },
]

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex-1 py-4">
      <ul className="space-y-1 px-3">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-64 min-h-screen border-r bg-white dark:bg-zinc-900 flex-col">
        <div className="p-6 border-b">
          <span className="font-bold text-lg tracking-tight">Omni Incubator Admin</span>
        </div>
        <NavLinks />
      </aside>

      {/* Mobile hamburger button — shown only on mobile */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              className="flex items-center justify-center w-10 h-10 rounded-md bg-white dark:bg-zinc-900 border border-input shadow-sm hover:bg-muted transition-colors"
              aria-label="Open admin menu"
            >
              <Menu className="size-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 pt-0">
            <SheetTitle className="sr-only">Admin navigation</SheetTitle>
            <div className="p-6 border-b">
              <span className="font-bold text-lg tracking-tight">Omni Incubator Admin</span>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
```

**`src/app/(admin)/layout.tsx`** — Add top padding on mobile to account for the fixed hamburger button:

```tsx
// Change:
<main className="flex-1 overflow-y-auto p-8">{children}</main>

// To:
<main className="flex-1 overflow-y-auto p-8 pt-16 md:pt-8">{children}</main>
```

---

### 3.26 R6 — Mobile: Product Card Grid Fix

**File: `src/app/library/page.tsx`**

Change grid class from `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` to:
```
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

The homepage featured e-books grid (Section 2 in R1) must use the same breakpoints: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

---

### 3.27 R6 — Mobile: Admin Table `overflow-x-auto`

**`src/app/(admin)/admin/orders/page.tsx`** — Currently a placeholder. Add `overflow-x-auto` to the content div:
```tsx
// Replace current placeholder body with:
<div className="space-y-6">
  <h1 className="text-2xl font-bold">Orders</h1>
  <div className="overflow-x-auto">
    <p className="text-zinc-500">Coming in a future phase.</p>
  </div>
</div>
```

**`src/components/admin/product-table.tsx`** — Wrap the `<Table>` component in `overflow-x-auto`:
```tsx
// Before:
return (
  <Table>
    ...
  </Table>
)

// After:
return (
  <div className="overflow-x-auto">
    <Table>
      ...
    </Table>
  </div>
)
```

**`src/app/(admin)/admin/ebooks/page.tsx`** — Currently a placeholder:
```tsx
<div className="space-y-6">
  <h1 className="text-2xl font-bold">E-books</h1>
  <div className="overflow-x-auto">
    <p className="text-zinc-500">Coming in a future phase.</p>
  </div>
</div>
```

---

### 3.28 R7 — next/image: `src/components/layout/navbar-auth.tsx`

**Change type:** Replace raw `<img>` with `next/image`.

```tsx
// Add import at top:
import Image from 'next/image'

// Replace:
<img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />

// With:
<Image
  src={avatarUrl}
  alt="Avatar"
  width={32}
  height={32}
  className="w-8 h-8 rounded-full object-cover"
  unoptimized  // avatar URLs are from Supabase Storage — external domain config may not be set
/>
```

Note: `unoptimized` is used because Supabase Storage URLs may not be configured in `next.config` `remotePatterns`. If Supabase Storage hostname is already in `remotePatterns`, `unoptimized` can be omitted. The implementor should check `next.config.ts` and prefer omitting `unoptimized` if the domain is already configured.

**Also:** `src/app/(admin)/admin/users/page.tsx` contains a raw `<img>` for user avatars (line 170, inside the eslint-disable comment). Replace it with `next/image` using the same pattern as navbar-auth.

---

### 3.29 R7 — CLS: ProductCard cover image

`src/components/library/product-card.tsx` already uses the `style={{ paddingBottom: '133.33%' }}` inline padding technique for the cover image container with `fill`. This is acceptable for CLS prevention. No change required. The `aspect-[3/4]` Tailwind class approach would be equivalent, but changing the working implementation is unnecessary churn.

`src/components/ebook/ebook-detail.tsx` cover image also uses the same `style={{ paddingBottom: '133.33%' }}` pattern. No change required.

---

### 3.30 R7 — Priority prop

No homepage hero image exists (R1 hero is text-only). No `priority` prop is needed there.

For library page first-row cards: `ProductCard` does not currently accept a `priority` prop. Add optional `priority` prop to `ProductCard`:

**`src/components/library/product-card.tsx`** — Add `priority?: boolean` to the props interface and pass it to `<Image>`:

```tsx
// Add to ProductCardProps:
priority?: boolean

// Add to Image component:
priority={priority}
```

**`src/app/library/page.tsx`** — Pass `priority={i < 4}` to the first 4 cards. Since `productCards.map((product, i) =>` — add index `i` and pass `priority={i < 4}`.

---

### 3.31 R8 — RLS Script: `scripts/verify-rls.ts`

**New file.**

```ts
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const TABLES = [
  'profiles',
  'products',
  'ebooks',
  'user_ebooks',
  'orders',
  'subscriptions',
  'sweepstakes',
  'sweepstake_entries',
  'services',
  'sample_products',
  'lead_submissions',
]

interface RLSRow {
  table_name: string
  rls_enabled: boolean
  policy_count: number
}

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT
        c.relname AS table_name,
        c.relrowsecurity AS rls_enabled,
        COUNT(p.polname) AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_policies p ON p.tablename = c.relname AND p.schemaname = n.nspname
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relname = ANY($1)
      GROUP BY c.relname, c.relrowsecurity
    `,
    params: [TABLES],
  })

  if (error) {
    // Fallback: query information_schema + pg_policies directly
    console.warn('RPC method unavailable, using direct query...')
    // Direct approach via raw SQL using the admin REST API is not directly available
    // without pg_rpc. Use supabase-js .from() to query pg_catalog via views.
    console.error('Unable to query RLS status. Ensure pg_catalog access is granted to service role.')
    console.error(error.message)
    process.exit(1)
  }

  const rows = data as RLSRow[]

  const ok: string[] = []
  const danger: string[] = []
  const warning: string[] = []
  const missing: string[] = []

  const found = new Set(rows.map((r) => r.table_name))

  for (const table of TABLES) {
    if (!found.has(table)) {
      missing.push(table)
      continue
    }
  }

  for (const row of rows) {
    if (row.rls_enabled && Number(row.policy_count) >= 1) {
      ok.push(`${row.table_name} (${row.policy_count} policies)`)
    } else if (row.rls_enabled && Number(row.policy_count) === 0) {
      danger.push(row.table_name)
    } else {
      warning.push(row.table_name)
    }
  }

  console.log('\n=== RLS Audit Report ===\n')
  console.log('✅ OK (RLS on + policies):')
  ok.forEach((t) => console.log(`   ${t}`))
  console.log('\n🚨 DANGER (RLS on + 0 policies — locked out):')
  danger.forEach((t) => console.log(`   ${t}`))
  console.log('\n⚠️  WARNING (RLS off — open to all):')
  warning.forEach((t) => console.log(`   ${t}`))
  if (missing.length > 0) {
    console.log('\n❓ NOT FOUND (table does not exist):')
    missing.forEach((t) => console.log(`   ${t}`))
  }
  console.log()

  if (danger.length > 0) {
    console.error('ACTION REQUIRED: Tables with RLS enabled but zero policies will reject all queries.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
```

**Important note on implementation:** The script uses `supabase.rpc('exec_sql')`. If this RPC function is not installed in the Supabase project, the script will fail. An alternative approach queries `pg_policies` directly using the service role via the REST API. The implementor should use the direct `pg_policies` query approach via a raw fetch to the Supabase REST endpoint as a fallback, or document that `exec_sql` must be created. The simpler and more reliable approach for this audit tool is to use the Postgres connection string with `pg` or `postgres` npm package — but this adds a new dependency. Since the requirement specifies `tsx` only, use the Supabase JS client and query `pg_class` as a view joined to `pg_policies`.

**Revised approach (no RPC needed):**

Use two separate queries:
1. `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'` — this is accessible via `supabase.from('pg_tables').select(...)` but pg_tables may not be accessible via the JS client.

**Final decided approach:** Use `supabase` service role client to query `information_schema.tables` for existence, and `pg_policies` for policy count. This is simpler and avoids RPC:

```ts
// Query 1: get RLS status from pg_tables
const { data: tablesData } = await supabase
  .from('pg_tables')  // This will likely fail — use raw SQL via REST

// Alternative: Use the Supabase management API (requires different credentials)
// Simplest working approach: query pg_policies directly
const { data: policiesData } = await supabase
  .from('pg_policies')
  .select('tablename, policyname, schemaname')
  .eq('schemaname', 'public')
```

**Final decision (documented for implementor):** The script queries `pg_policies` to count policies per table and uses a manual `TABLES` check. RLS-on status requires querying `pg_class.relrowsecurity` which requires either direct Postgres access or an RPC function. The implementor should create the script in the most reliable way for their Supabase setup. At minimum, the script must run without crashing and report policy counts. If `pg_class` is not accessible, the script reports a warning and exits cleanly.

The **concrete deliverable**: `scripts/verify-rls.ts` must exist, accept `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` env vars, query the 11 required tables, and output a categorized report. If pg_class access fails, output a graceful message.

---

### 3.32 R8 — Runbook: `docs/runbooks/runbook-rls-audit.md`

**New file.** Document how to run the script and interpret output.

---

### 3.33 R9 — Privacy Page: `src/app/privacy/page.tsx`

**Change type:** Complete rewrite. Static server component. Proper heading hierarchy, container/padding layout, placeholder content per R9 spec.

Structure:
- `<div className="container mx-auto max-w-3xl py-16 px-4">`
- `<h1>Privacy Policy</h1>` with last-updated date placeholder
- Placeholder notice `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}` rendered in a styled amber callout box
- Five `<section>` elements, each with `<h2>` and body paragraphs:
  1. Data We Collect
  2. How We Use Your Information
  3. Third-Party Services (Stripe, Supabase, Resend, Beehiiv, Rewardful — each mentioned by name)
  4. Cookies and Tracking
  5. Contact Us
- Each section body includes: `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`
- Add `export const metadata` (see 3.13 above)

---

### 3.34 R9 — Terms Page: `src/app/terms/page.tsx`

**Change type:** Complete rewrite. Same structural pattern as privacy page.

Structure:
- `<div className="container mx-auto max-w-3xl py-16 px-4">`
- `<h1>Terms of Service</h1>` with last-updated date placeholder
- Placeholder callout box
- Six `<section>` elements:
  1. Acceptance of Terms
  2. Description of Services
  3. Membership Terms (trial, billing, cancellation, plan switching)
  4. E-book License (personal, non-commercial, non-transferable)
  5. Refund Policy
  6. Limitation of Liability
- Each section body includes: `{PLACEHOLDER — EXTERNAL TASK E14}`
- Add `export const metadata` (see 3.14 above)

---

### 3.35 R10 — vercel.json

**Change type:** Augment existing file. Preserve `functions` block.

**New `vercel.json`:**

```json
{
  "functions": {
    "src/app/api/webhooks/stripe/route.ts": {
      "maxDuration": 60
    }
  },
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/(_next/static|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg)(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

---

### 3.36 R11 — Pre-launch Checklist: `docs/runbooks/pre-launch-checklist.md`

**New file.** Markdown checklist with `- [ ]` items grouped into 10 sections per R11 spec.

---

### 3.37 Static OG Banner Asset: `public/og-banner.png`

**New file.** 1200×630px PNG. A minimal branded placeholder is acceptable. The implementor should create this using any image editor, Canvas API script, or online tool. Minimum requirement: a solid-color background with "Omni Incubator" text. This file must exist for OG metadata to function — a 1×1 placeholder will not satisfy AC 5/6.

A simple programmatic approach: create a `scripts/generate-og-banner.ts` file that uses the `canvas` npm package to render a simple PNG. Alternatively, the implementor can create this in Figma or Canva and export it. The asset itself is out of scope for code review but is a build prerequisite.

**Decision:** The implementor must deliver `public/og-banner.png` at 1200×630px. A simple solid-color file with text is sufficient.

---

### 3.38 `package.json` — Add `tsx` to devDependencies

**Change type:** Add one devDependency.

```json
"tsx": "^4.19.2"
```

---

## 4. Acceptance Criteria Cross-Reference

| AC # | Requirement | Covered By |
|---|---|---|
| 1 | Homepage renders all 5 sections | §3.1 |
| 2 | Hero shows active sweepstake prize | §3.1 |
| 3 | Hero shows fallback text when no sweepstake | §3.1 |
| 4 | Featured ebooks renders ≤3 ProductCard components | §3.1 |
| 5 | All 12 pages have metadata | §3.2–3.14 |
| 6 | Root layout title is object with default+template | §3.2 |
| 7 | sitemap.ts exists and produces valid XML | §3.15 |
| 8 | Sitemap includes /library/{slug} for active ebooks | §3.15 |
| 9 | robots.ts exists and disallows /admin/ /profile/ | §3.16 |
| 10 | library/loading.tsx renders 12 card skeletons | §3.17 |
| 11 | library/[slug]/loading.tsx renders skeleton detail | §3.18 |
| 12 | admin/products/loading.tsx renders skeleton table | §3.19 |
| 13 | admin/orders/loading.tsx renders skeleton table | §3.20 |
| 14 | admin/users/loading.tsx renders skeleton table | §3.21 |
| 15 | All checkout/form buttons show disabled+spinner | §3.22 |
| 16 | /not-found.tsx passes | Already passing |
| 17 | /error.tsx Sentry + user message | Already passing |
| 18 | /403/page.tsx passes | Already passing |
| 19 | Checkout failures surface toast.error | §3.22 |
| 20 | Library filter sidebar is Sheet on ≤768px | §3.24 |
| 21 | Admin sidebar is Sheet/hamburger on ≤768px | §3.25 |
| 22 | Product grid 1 col mobile, 2 tablet, 3-4 desktop | §3.26 |
| 23 | orders/products/ebooks tables have overflow-x-auto | §3.27 |
| 24 | No raw img tags | §3.28 |
| 25 | All next/image have width/height or fill+parent | §3.28, §3.29 |
| 26 | Cover images have aspect ratio wrappers | §3.29 (already passing) |
| 27 | priority prop on first-row library cards | §3.30 |
| 28 | verify-rls.ts exists and runs | §3.31 |
| 29 | runbook-rls-audit.md exists | §3.32 |
| 30 | /privacy has substantive content with placeholder | §3.33 |
| 31 | /terms has substantive content with placeholder | §3.34 |
| 32 | vercel.json has security headers | §3.35 |
| 33 | vercel.json retains maxDuration:60 | §3.35 |
| 34 | pre-launch-checklist.md exists | §3.36 |
| 35 | npm run build exits 0 | All changes |
| 36 | npx tsc --noEmit exits 0 | All changes |
| 37 | Vitest 7/7 passing | No test changes |

---

## 5. Files Summary

### New Files
| Path | Type |
|---|---|
| `src/app/sitemap.ts` | Server function |
| `src/app/robots.ts` | Server function |
| `src/app/library/loading.tsx` | Loading skeleton |
| `src/app/library/[slug]/loading.tsx` | Loading skeleton |
| `src/app/(admin)/admin/products/loading.tsx` | Loading skeleton |
| `src/app/(admin)/admin/orders/loading.tsx` | Loading skeleton |
| `src/app/(admin)/admin/users/loading.tsx` | Loading skeleton |
| `src/components/library/filter-sheet-trigger.tsx` | UI component |
| `public/og-banner.png` | Static asset |
| `scripts/verify-rls.ts` | Dev script |
| `docs/runbooks/runbook-rls-audit.md` | Documentation |
| `docs/runbooks/pre-launch-checklist.md` | Documentation |

### Modified Files
| Path | Change |
|---|---|
| `src/app/page.tsx` | Complete rewrite — homepage |
| `src/app/layout.tsx` | Upgrade metadata object |
| `src/app/(admin)/layout.tsx` | Add metadata + pt-16 mobile tweak |
| `src/app/library/page.tsx` | Add metadata, fix grid classes, add mobile filter button |
| `src/app/library/[slug]/page.tsx` | Add generateMetadata |
| `src/app/pricing/page.tsx` | Add metadata |
| `src/app/marketplace/page.tsx` | Add metadata |
| `src/app/marketplace/[slug]/page.tsx` | Add OG image to generateMetadata |
| `src/app/sweepstakes/page.tsx` | Add generateMetadata |
| `src/app/sweepstakes/rules/page.tsx` | Add metadata |
| `src/app/login/page.tsx` | Add metadata |
| `src/app/profile/page.tsx` | Add metadata |
| `src/app/profile/ebooks/page.tsx` | Add metadata |
| `src/app/profile/orders/page.tsx` | Add metadata |
| `src/app/profile/entries/page.tsx` | Add metadata |
| `src/app/profile/subscription/page.tsx` | Add metadata |
| `src/app/privacy/page.tsx` | Complete rewrite — substantive content |
| `src/app/terms/page.tsx` | Complete rewrite — substantive content |
| `src/app/error.tsx` | Add "Go home" link |
| `src/app/(admin)/admin/orders/page.tsx` | Add overflow-x-auto wrapper |
| `src/app/(admin)/admin/ebooks/page.tsx` | Add overflow-x-auto wrapper |
| `src/components/admin/admin-sidebar.tsx` | Rewrite with mobile Sheet |
| `src/components/admin/product-table.tsx` | Wrap Table in overflow-x-auto div |
| `src/components/admin/product-form.tsx` | Verify/add Loader2 to submit button |
| `src/components/admin/sweepstake-form.tsx` | Add Loader2 to submit button |
| `src/components/billing/checkout-button.tsx` | Add toast.error on checkout failure |
| `src/components/billing/pricing-cards.tsx` | Add toast.error on checkout failure |
| `src/components/library/product-card.tsx` | Add priority prop |
| `src/components/layout/navbar-auth.tsx` | Replace raw img with next/image |
| `vercel.json` | Add security headers + caching headers |
| `package.json` | Add tsx to devDependencies |

---

## 6. Non-Functional Requirements

- **ISR:** Homepage uses `revalidate = 60`. Library page already uses `revalidate = 60`. No changes to those patterns.
- **No new DB migrations:** All queries use existing schema.
- **TypeScript:** All new files must be typed. No `any` unless justified.
- **No new npm production packages:** Only `tsx` added to devDependencies.
- **Build must pass:** All metadata exports must use `Metadata` from `next` (already imported in layout).
- **Existing tests must not regress:** Vitest 7/7. No test files are modified.
