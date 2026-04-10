# PRD — Phase 6: Polish & Deploy

## Phase Goal
Build the homepage, add full SEO metadata to all pages, ensure mobile responsiveness at all breakpoints, add loading states and skeleton loaders, implement robust error handling, audit RLS policies, add 404/500 pages, create vercel.json for production, and verify the application is production-ready.

**Note on external tasks:** Several Phase 6 tasks depend on human action (Vercel deployment, DNS, Stripe live mode, Supabase production project). These are flagged as EXTERNAL TASKs and do not block the code deliverables. The codebase must be production-ready; actual deployment is a human task.

## Requirements

### R1 — Homepage
- `/` (server component, ISR revalidate 60)
- Replace the current placeholder. Sections (top to bottom):
  1. **Hero**: headline "Build, Launch, and Grow — Join the Omni Incubator", subheadline about membership + e-books + sweepstakes, two CTA buttons: "Browse the Library" (→ /library) and "Join Now" (→ /pricing), current active sweepstake prize callout ("🎟️ Win ${prize_description} — No purchase necessary")
  2. **Featured e-books**: 3 most recently created active e-books shown as product cards (same ProductCard component)
  3. **How it works**: 3-step section — "Join" → "Learn" → "Win" with brief descriptions
  4. **Membership pitch**: value prop card — what you get, $15/mo or $129/yr pricing, "Start free trial" CTA → /pricing
  5. **Newsletter callout**: "Join our monthly newsletter" with brief description (newsletter is a membership benefit — CTA goes to /pricing, not a standalone subscribe form)
- Fetch: active sweepstake (for prize callout), 3 featured products (limit 3, is_active=true, type='ebook', order by created_at desc)
- If no active sweepstake: omit prize callout from hero, show generic "Enter our next sweepstake" text

### R2 — SEO: generateMetadata on all pages
- Add `generateMetadata()` (or export `metadata` const) to every page that doesn't already have it:
  - `/` — site name, description, OG image (static banner), canonical
  - `/library` — "E-book Library | Omni Incubator", description
  - `/library/[slug]` — already has metadata from Phase 2, verify it includes OG image (cover_image_url)
  - `/pricing` — "Membership Plans | Omni Incubator"
  - `/marketplace` — "Service Marketplace | Omni Incubator"
  - `/marketplace/[slug]` — service title, description, OG
  - `/sweepstakes` — "Win ${prize_amount} | Omni Incubator Sweepstakes"
  - `/sweepstakes/rules` — "Official Sweepstakes Rules | Omni Incubator"
  - `/free/[slug]` — already has metadata from Phase 4B, verify
  - `/login` — "Sign In | Omni Incubator"
  - `/profile` — "My Profile | Omni Incubator" (noindex)
  - `/admin/*` — noindex on all admin pages
- Default metadata in root layout: fallback title template "... | Omni Incubator", site description, OG image

### R3 — Sitemap and robots.txt
- `src/app/sitemap.ts` — Next.js dynamic sitemap. Includes: static pages (/, /library, /pricing, /marketplace, /sweepstakes, /sweepstakes/rules), all active e-book detail pages (/library/[slug]), all active sample product pages (/free/[slug]), all active/approved service pages (/marketplace/[slug]). Exclude all /admin/* and /profile/* routes.
- `src/app/robots.ts` — disallow /admin/* and /profile/*, allow everything else. Sitemap URL included.

### R4 — Loading States
- Add `loading.tsx` files for pages that do data fetching:
  - `src/app/library/loading.tsx` — skeleton grid (12 cards)
  - `src/app/library/[slug]/loading.tsx` — skeleton detail layout
  - `src/app/(admin)/admin/products/loading.tsx` — skeleton table
  - `src/app/(admin)/admin/orders/loading.tsx` — skeleton table  
  - `src/app/(admin)/admin/users/loading.tsx` — skeleton table
- Add button loading spinners: all form submission buttons must show a loading state (disabled + spinner) while the action/API call is in flight. Audit all existing forms and checkout buttons.

### R5 — Error Handling Polish
- `/not-found.tsx` already exists from Phase 1 — verify it's styled properly (link back to homepage)
- `/error.tsx` already exists — verify it shows a user-friendly message with Sentry error reporting
- Add toast error handling on all checkout API calls that might fail (network errors, Stripe errors) — these should show a user-friendly toast, not leave the user on a broken page
- Verify the 403 page (`/403`) is styled properly

### R6 — Mobile Responsiveness Audit
- Review all pages for mobile breakpoints (375px, 768px, 1024px):
  - Library filter sidebar: on mobile, show as a collapsible sheet (shadcn Sheet) instead of static sidebar
  - Admin sidebar: already uses Sheet for mobile from Phase 1 — verify
  - Product cards grid: verify 1 col on mobile, 2 on tablet, 3-4 on desktop
  - Navigation: verify hamburger menu works on all pages
  - Touch targets: all buttons and links ≥ 44px height
  - Tables (admin): make horizontally scrollable on mobile with `overflow-x-auto`
- Fix any layout issues found

### R7 — Performance
- Verify all images use `next/image` (Image component) with proper width/height props
- Verify library page and product cards use correct image sizes
- Verify cover images have explicit aspect ratios to prevent CLS (Cumulative Layout Shift)
- Add `priority` prop to above-the-fold images (homepage hero, library page first row)

### R8 — RLS Policy Audit
- Write a verification script `scripts/verify-rls.ts` that connects to Supabase and checks:
  - A list of tables that should have RLS enabled
  - Confirms at least one policy exists per table
  - Reports any table with RLS enabled but zero policies (locked out)
  - Reports any table with RLS disabled (open)
- This is a development/audit tool — run with `npx ts-node scripts/verify-rls.ts` or `node -r tsx/esm scripts/verify-rls.ts`
- Document in docs/runbooks/

### R9 — Privacy, Terms, Legal Pages
- `/privacy` — Replace placeholder with a privacy policy placeholder covering: data collected, how used, third-party services (Stripe, Supabase, Resend, Beehiiv, Rewardful), cookies, contact. Mark as `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`.
- `/terms` — Replace placeholder with terms of service placeholder covering: acceptance, services, membership terms, e-book license, refunds, limitation of liability. Mark as `{PLACEHOLDER — EXTERNAL TASK E14}`.
- Both pages: static, no data fetching, proper layout with heading hierarchy.

### R10 — vercel.json Finalization
- Update `vercel.json` to include any production-specific config:
  - Verify maxDuration: 60 for webhook route (already exists from Phase 3)
  - Add security headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy
  - Add caching headers for static assets

### R11 — Pre-launch Checklist Doc
- Create `docs/runbooks/pre-launch-checklist.md` — a comprehensive manual smoke test checklist covering:
  - Auth: sign up OTP, sign up Google, sign in, sign out
  - E-books: browse library, filter, search, view detail, preview download
  - Checkout: buy e-book, buy membership, buy e-book + membership upsell
  - Webhooks: verify Stripe events processed
  - Downloads: download owned e-book
  - Profile: view/edit profile, view orders, view subscription, manage via portal
  - Sweepstakes: enter via popup, confirm email, view entries
  - Sample product: visit landing page, submit form, confirm email, download
  - Admin: create product, upload file, create sweepstake, activate it, view users
  - Emails: verify each template sends correctly

## Acceptance Criteria
1. `/` homepage renders with hero, featured e-books, how it works, membership pitch
2. Homepage shows active sweepstake prize callout (or generic text if none)
3. All 12 listed pages have generateMetadata() — verify with build output
4. `src/app/sitemap.ts` generates valid sitemap including dynamic e-book and sample product URLs
5. `src/app/robots.ts` exists and disallows /admin/* and /profile/*
6. Loading skeletons exist for /library, /library/[slug], and 3 admin pages
7. Library filter sidebar converts to Sheet component on mobile (≤768px)
8. All admin tables have overflow-x-auto wrapper for horizontal scroll on mobile
9. All images use next/image with width/height props
10. `/privacy` and `/terms` pages have real placeholder content (not just "Coming soon")
11. `/not-found.tsx` has a styled 404 with link back to homepage
12. `scripts/verify-rls.ts` exists and is documented in runbooks
13. `vercel.json` has security headers configured
14. `docs/runbooks/pre-launch-checklist.md` exists with full checklist
15. `npm run build` passes with no errors
16. `npx tsc --noEmit` passes with 0 errors
17. Vitest 7/7 passing

## Out of Scope for Phase 6 (Requires Human Action)
- Actual Vercel deployment and DNS setup (EXTERNAL TASK E11, E12)
- Supabase production project creation (EXTERNAL TASK E1)
- Google Cloud OAuth setup (EXTERNAL TASK E3)
- Stripe live mode activation (EXTERNAL TASK E13)
- Legal review of privacy policy, terms, sweepstakes rules (EXTERNAL TASK E14)
- First sweepstake creation (EXTERNAL TASK E15)
- First e-book and sample product upload (EXTERNAL TASK E16, E17)
