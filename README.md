# Omni Incubator

SaaS membership platform for digital products, sweepstakes, and lead magnets.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript, `src/` layout) |
| Styling | Tailwind CSS v4 + shadcn/ui (New York style, zinc) |
| Database | Supabase Postgres (Supabase CLI migrations) |
| Auth | Supabase Auth — Email OTP + Google OAuth |
| Storage | Supabase Storage (5 buckets) |
| Error monitoring | Sentry (`@sentry/nextjs`, graceful no-op when DSN absent) |
| Payments | Stripe (Phase 3) |
| Email | Resend + React Email (Phase 3) |
| Newsletter | Beehiiv (Phase 3) |
| Rate limiting | Upstash Redis (Phase 4A) |
| Affiliate tracking | Rewardful (Phase 3) |
| Deployment | Vercel |

## Prerequisites

- Node.js 20+
- npm 10+
- Supabase CLI (`brew install supabase/tap/supabase` or see [Supabase CLI docs](https://supabase.com/docs/guides/cli))

## Local Development Setup

1. **Clone and install dependencies**

   ```bash
   git clone <repo-url>
   cd omni-incubator
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and fill in at minimum:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
   - `SUPABASE_SERVICE_ROLE_KEY` — your Supabase service role key
   - `NEXT_PUBLIC_SITE_URL` — `http://localhost:3000` for local dev

   All other variables are optional for local development (the app no-ops gracefully when Sentry, Stripe, Beehiiv, Resend, Rewardful, and Upstash keys are absent). Without Upstash keys, rate limiting on lead-capture endpoints is skipped but the endpoints remain fully functional.

3. **Apply database migrations**

   You need a Supabase project first (see [External Tasks checklist](docs/runbooks/runbook-external-tasks.md)).

   ```bash
   # Push migrations to your Supabase project
   supabase db push

   # Or reset to a clean state (drops and recreates)
   supabase db reset
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

   The app runs at [http://localhost:3000](http://localhost:3000).

5. **Build for production**

   ```bash
   npm run build
   ```

   Note: a valid `SENTRY_AUTH_TOKEN` is required for Sentry source map uploads during build. Omit it (or leave blank) for local builds — Sentry upload is skipped automatically.

## What's Been Built

### Phase 1 — Foundation
Authentication (Email OTP + Google OAuth), Supabase setup, middleware, profile management, Sentry error monitoring, shadcn/ui component library, root layout with navbar/footer.

### Phase 2 — Products & Library
- **Admin product CRUD** (`/admin/products`) — create, edit, archive e-books. Server Actions (`src/app/actions/products.ts`) handle all mutations with admin auth guard.
- **Admin services CRUD** (`/admin/services`) — create, edit, archive services. Server Actions in `src/app/actions/services.ts`.
- **Stripe sync utility** (`src/lib/stripe.ts`) — lazy singleton pattern; syncs e-book products to Stripe on create/price change. No-ops gracefully when `STRIPE_SECRET_KEY` is absent.
- **File upload API** (`/api/admin/ebooks/[id]/upload`) — multipart upload for e-book PDFs, preview PDFs, and cover images to Supabase Storage. Admin-only.
- **Library page** (`/library`) — public product grid with category/metadata filtering, keyword search, sort options, and pagination (Load More, page size 12). ISR revalidation every 60s.
- **E-book detail page** (`/library/[slug]`) — cover, markdown descriptions (via `react-markdown` + `remark-gfm`), pricing, preview download, ownership check.
- **Marketplace page** (`/marketplace`) — Coming Soon hero with email capture form and service card grid.
- **Preview download API** (`/api/ebooks/[id]/preview`) — public 307 redirect to CDN URL for preview PDFs.
- **Library products API** (`/api/library/products`) — paginated + filtered product listing for Load More.

### Phase 3 — Billing
- **Checkout APIs** — `POST /api/checkout/membership` (subscription with 7-day trial + Rewardful support), `POST /api/checkout/ebook` (member/non-member price detection + coupon), `POST /api/checkout/ebook-with-membership` (combined single-session checkout).
- **Stripe webhook handler** (`/api/webhooks/stripe`) — idempotent processor for 7 event types using `claim_stripe_event` Postgres RPC. Handles `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`. Raw body preserved for signature verification; `vercel.json` sets `maxDuration: 60`.
- **Beehiiv integration** (`src/lib/beehiiv.ts`) — auto-subscribe on membership creation, auto-unsubscribe on cancellation. Non-blocking; no-ops when keys are absent.
- **Resend email system** (`src/lib/email.tsx`) — 5 React Email templates (ebook purchase, membership welcome, membership charged, trial ending, payment failed). Logs to `email_log` table; non-blocking.
- **Coupon validation** (`src/lib/coupon.ts`, `POST /api/coupons/validate`) — case-insensitive lookup, active/expiry/global-limit/per-user-limit checks.
- **Profile pages** — `/profile/orders` (paginated with expandable line items), `/profile/ebooks` (owned ebook grid with download buttons), `/profile/subscription` (status badge, trial/billing dates, Manage Subscription portal link).
- **Download page** (`/ebooks/download/[id]`) — ownership check, checkout success banner, `<DownloadButton>` for owners.
- **Pricing page** (`/pricing`) — monthly/annual toggle, $15/$129, member detection, 7-day trial CTA.
- **Signed download API** (`GET /api/ebooks/[id]/download`) — ownership check, 1-hour Supabase Storage signed URL, atomic download count increment via `increment_download_count` RPC, 307 redirect.
- **Billing portal** (`POST /api/subscription/portal`) — creates Stripe Billing Portal session for subscription self-management.

### Phase 4B — Sample Products & Admin Tools
- **Sample product admin CRUD** (`/admin/sample-products`) — create, edit, toggle active. Server Actions (`src/app/actions/sample-products.ts`). File upload API (`POST /api/admin/sample-products/[id]/upload`) handles PDFs → `sample-products` bucket and covers → `covers` bucket.
- **Sample product landing page** (`/free/[slug]`) — ISR 60s; 404 for inactive/unknown slugs; lead capture form with optional phone field; entry callout when a sweepstake is active. Confirmation redirect to `/free/[slug]/download?token=`.
- **Sample product download page** (`/free/[slug]/download`) — server-side token validation with redirect for unconfirmed/missing/mismatched tokens. Upsell section for linked products and membership.
- **Sample product download API** (`GET /api/sample-products/[slug]/download`) — token-based public download: validates token, confirmed_at, product match; 307 redirect to 1-hour Supabase Storage signed URL.
- **Admin user management** (`/admin/users`, `/admin/users/[id]`) — search by email/name/phone/order number; user detail shows profile, subscription, orders, e-books, entry breakdown, and entry history. Entry adjustment form (`adjustUserEntries` Server Action) creates `sweepstake_entries` with `source='admin_adjustment'`; non-zero entries and non-empty notes enforced.
- **CSV export** (`GET /api/admin/sweepstakes/[id]/export`) — admin only; refreshes `entry_verification` materialized view via `refresh_entry_verification` RPC before querying; calls `export_sweepstake_entries(sweepstake_id)` SECURITY DEFINER RPC (migration 000018); returns 10-column CSV attachment (see ADR-011).
- **Public sweepstakes page** (`/sweepstakes`) — ISR 60s; hero with prize amount and `<CountdownTimer>`; "Ways to enter" lists active sample products; coming-soon fallback when no active sweepstake.
- **Official rules page** (`/sweepstakes/rules`) — static; 9 legal sections with placeholder pending legal review (E14).
- **Profile entries page** (`/profile/entries`) — force-dynamic; shows `total_entries` and source breakdown (purchase, non-purchase, admin, coupon bonus) from `entry_verification`; "no active sweepstake" state.
- **Admin dashboard** (`/admin`) — replaced redirect stub; stat cards for active members, revenue this month, active sweepstake summary, and lead capture totals; amber warning banner when no active sweepstake; recent orders table.
- **`CountdownTimer` component** (`src/components/sweepstakes/CountdownTimer.tsx`) — client component; null-initialized state to avoid hydration mismatch; renders "Sweepstake ended" when past the end date.

### Phase 6 — Polish & Deploy
- **Homepage** (`/`) — ISR 60s; 5 sections: Hero (with conditional sweepstake prize callout), Featured E-books grid (up to 3 cards), How It Works (3 steps), Membership Pitch ($15/mo and $129/yr), Newsletter Callout. Replaces the two-line placeholder.
- **SEO metadata** — `generateMetadata` or `metadata` export added to all 12 public pages. Dynamic pages (`/library/[slug]`, `/marketplace/[slug]`, `/sweepstakes`) fetch live data for OG titles and images. Profile and admin routes have `robots: noindex`.
- **Sitemap and robots** — `src/app/sitemap.ts` generates 8 static routes + dynamic ebook, sample product, and service URLs from Supabase. `src/app/robots.ts` disallows `/admin/` and `/profile/`.
- **Loading skeletons** — 5 `loading.tsx` files added: `/library`, `/library/[slug]`, `/admin/products`, `/admin/orders`, `/admin/users`.
- **Mobile responsiveness** — Library filter sidebar converted to a shadcn Sheet trigger on mobile (`FilterSheetTrigger`). Admin sidebar converted to a client component with Sheet hamburger menu (`md:hidden`).
- **next/image compliance** — All raw `<img>` tags replaced with `<Image>` from `next/image`. First 4 library cards receive `priority` prop via an optional prop on `ProductCard`. Avatar images use `unoptimized` (no `remotePatterns` configured for Supabase Storage user-uploaded URLs).
- **Error and form polish** — `error.tsx` gets a "Go home" link. Checkout, pricing, profile save, sweepstake, and product form buttons show `Loader2` spinner on pending state. Toast error on checkout failure.
- **Privacy and Terms pages** (`/privacy`, `/terms`) — substantive multi-section placeholder content (5 and 6 sections respectively). Both include E14 external-task callout notice.
- **Security headers** — `vercel.json` adds 4 security headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`) on all routes, plus `Cache-Control: immutable` on static assets. `maxDuration: 60` on webhook preserved.
- **OG banner** — `public/og-banner.png` (1200×630px, zinc background) and `public/og-banner.svg` (branded text) added as fallback OG image.
- **RLS audit** — `scripts/verify-rls.ts` queries `pg_policies` + `pg_tables` and produces a categorized OK/DANGER/WARNING report. Exits with code 1 on DANGER conditions. Documented in `docs/runbooks/runbook-rls-audit.md`.
- **Pre-launch checklist** — `docs/runbooks/pre-launch-checklist.md` with 10 sections covering auth, e-books, checkout, webhooks, downloads, profile, sweepstakes, sample products, admin, and emails.

### Phase 5 — Marketplace Shell
- **Service detail page** (`/marketplace/[slug]`) — ISR 60s; 404 for `pending`/`suspended`/deleted services; rate display supporting all rate types (`hourly`, `fixed`, `monthly`, `custom`, `rate_label` override); `long_description` rendered as Markdown via `react-markdown` + `remark-gfm` in a `.prose` wrapper; provider name from `profiles` join; `<EntryBadge>` with Suspense when `custom_entry_amount > 0`; Coming Soon overlay with `<ServiceWaitlistCTA>` for `is_coming_soon` services; `generateMetadata`.
- **Entry badges on marketplace cards** (`/marketplace`) — `custom_entry_amount` added to query; `<EntryBadge>` with Suspense on cards; service cards wrapped with `<Link>` to detail page; only `active`/`approved` services shown.
- **Admin service approval workflow** (`/admin/services`) — status filter links (All / Pending Approval / Active); "Approve" quick-action button on pending rows via `<ServiceApproveButton>` client component; color status badge in edit form; status dropdown corrected to `pending`, `approved`, `active`, `suspended`.
- **`approveService` Server Action** (`src/app/actions/services.ts`) — admin auth guard; sets `status='approved'`; revalidates `/admin/services`.
- **Migration 000019** (`supabase/migrations/20240101000019_services_custom_entry_amount.sql`) — additive `ALTER TABLE` adding `custom_entry_amount INTEGER` to `services`.
- **Build:** 37 routes compiled, 0 TypeScript errors, 7/7 Vitest tests pass.

### Phase 4A — Sweepstakes Core
- **Entry engine** (`src/lib/sweepstakes.ts`) — pure functions (`calculateEntries`, `computeLeadCaptureEntries`) and DB writers (`awardPurchaseEntries`, `awardLeadCaptureEntries`). Entry calculation is separated from DB writes for testability (see ADR-009).
- **Lead capture API** (`POST /api/lead-capture`) — creates a `lead_captures` row with `confirmed_at=NULL`; sends a confirmation email via Resend. Rate-limited 5/IP/hr via Upstash (skipped gracefully when not configured). Entries are not awarded until email is confirmed (see ADR-010).
- **Confirmation and resend** (`POST /api/lead-capture/confirm`, `POST /api/lead-capture/resend`) — token validated with 72-hour TTL; on confirm, awards sweepstake entries and handles sample-product redirect. Resend enforces a 5-minute cooldown at the DB level.
- **Stripe webhook entry awarding** — `awardPurchaseEntries()` called non-fatally inside `checkout.session.completed` (payment and combined modes) and `invoice.paid` (renewal, with combined-checkout dedup).
- **Admin sweepstakes CRUD** (`/admin/sweepstakes`) — create, edit, activate, end sweepstakes; manage entry multipliers (overlap warning); manage coupons (multiplier and fixed-bonus types; code uppercased on blur).
- **Entry badge** (`src/components/sweepstakes/EntryBadge.tsx`) — async server component showing entry count on library product cards and detail page; cached 60s; renders nothing when no active sweepstake.
- **Multiplier banner** (`src/components/sweepstakes/MultiplierBanner.tsx`) — server component in root layout showing active multiplier name and end date; client-side dismiss (not persisted); cached 60s.
- **Lead capture popup** (`src/components/sweepstakes/LeadCapturePopup.tsx`) — triggers after 10s or 50% scroll depth; permanently suppressed after submission (`omni_popup_submitted`); 30-day suppress after dismiss (`omni_popup_dismissed`).
- **Confirmation page** (`/confirm/[token]`) — handles 5 states: loading, success (with upsell CTAs), already confirmed, expired (shows re-entry form), invalid.
- **Vitest** — unit test suite added (`npm test`); 7 tests covering `calculateEntries` and `computeLeadCaptureEntries`.
- **Email templates** — `LeadCaptureConfirmEmail` and `SampleProductConfirmEmail` added to the Resend template system.

## Project Structure

```
omni-incubator/
├── src/
│   ├── app/
│   │   ├── (admin)/                # Admin route group — sidebar layout, no public nav
│   │   │   ├── layout.tsx          # Admin shell (AdminSidebar + main)
│   │   │   └── admin/
│   │   │       ├── products/       # CRUD pages for e-book products
│   │   │       ├── services/       # CRUD pages for services
│   │   │       ├── sweepstakes/    # Sweepstakes list, create/edit, multipliers management, CSV export
│   │   │       ├── coupons/        # Coupon list, create/edit
│   │   │       ├── sample-products/ # Sample product list, create/edit, file uploads
│   │   │       ├── users/          # User search + detail with entry adjustment
│   │   │       └── [others]/       # Placeholder pages (ebooks, orders)
│   │   ├── actions/
│   │   │   ├── products.ts         # Server Actions: createProduct, updateProduct, archiveProduct
│   │   │   ├── services.ts         # Server Actions: createService, updateService, archiveService, approveService
│   │   │   ├── sample-products.ts  # Server Actions: createSampleProduct, updateSampleProduct, toggleSampleProductActive
│   │   │   └── admin-users.ts      # Server Action: adjustUserEntries
│   │   ├── api/
│   │   │   ├── admin/ebooks/[id]/upload/route.ts                # Multipart file upload (admin only)
│   │   │   ├── admin/sample-products/[id]/upload/route.ts      # Sample product PDF + cover upload (admin only)
│   │   │   ├── admin/sweepstakes/[id]/export/route.ts          # CSV export via SECURITY DEFINER RPC (admin only)
│   │   │   ├── ebooks/[id]/preview/route.ts                    # Public preview PDF redirect
│   │   │   ├── ebooks/[id]/download/route.ts                   # Ownership check + signed URL + 307 redirect
│   │   │   ├── sample-products/[slug]/download/route.ts        # Token-based download + 307 redirect (public)
│   │   │   ├── library/products/route.ts                       # Paginated library listing
│   │   │   ├── auth/callback/route.ts                          # Google OAuth PKCE callback
│   │   │   ├── checkout/membership/route.ts                    # Subscription checkout session
│   │   │   ├── checkout/ebook/route.ts                         # Ebook payment checkout session
│   │   │   ├── checkout/ebook-with-membership/route.ts         # Combined checkout session
│   │   │   ├── coupons/validate/route.ts                       # Coupon validation
│   │   │   ├── webhooks/stripe/route.ts                        # Stripe webhook handler (idempotent)
│   │   │   ├── lead-capture/route.ts                           # Lead capture submit + confirmation email
│   │   │   ├── lead-capture/confirm/route.ts                   # Token validation + entry awarding
│   │   │   ├── lead-capture/resend/route.ts                    # Resend confirmation email (5-min cooldown)
│   │   │   ├── profile/orders/route.ts                         # Paginated order history
│   │   │   ├── profile/ebooks/route.ts                         # Owned ebook list
│   │   │   ├── profile/subscription/route.ts                   # Subscription status
│   │   │   └── subscription/portal/route.ts                    # Stripe Billing Portal session
│   │   ├── layout.tsx              # Root layout — navbar, footer, providers
│   │   ├── page.tsx                # Homepage — 5 sections, ISR 60s, sweepstake prize callout
│   │   ├── globals.css             # Tailwind directives + shadcn/ui CSS variables
│   │   ├── error.tsx               # Root error boundary (Sentry)
│   │   ├── not-found.tsx           # 404 page
│   │   ├── 403/page.tsx            # 403 Forbidden (admin access denied)
│   │   ├── login/page.tsx          # Email OTP + Google OAuth
│   │   ├── profile/page.tsx        # Profile view + edit form
│   │   ├── profile/orders/page.tsx         # Paginated order history
│   │   ├── profile/ebooks/page.tsx         # Owned ebooks grid
│   │   ├── profile/subscription/page.tsx   # Subscription status + portal
│   │   ├── library/page.tsx        # Product grid with filter/search/sort/pagination
│   │   ├── library/[slug]/page.tsx # E-book detail page (with billing integration)
│   │   ├── marketplace/page.tsx    # Service card grid — active/approved only; entry badges; links to detail
│   │   ├── marketplace/[slug]/page.tsx # Service detail page (ISR 60s)
│   │   ├── pricing/page.tsx        # Membership pricing page with toggle
│   │   ├── ebooks/download/[id]/page.tsx   # Download page (auth-protected)
│   │   ├── confirm/[token]/page.tsx        # Email confirmation — 5 states
│   │   ├── free/[slug]/page.tsx            # Sample product landing + lead capture (ISR 60s)
│   │   ├── free/[slug]/download/page.tsx   # Token-validated download page (force-dynamic)
│   │   ├── sweepstakes/page.tsx    # Public sweepstakes page — hero, countdown, entry methods (ISR 60s)
│   │   ├── sweepstakes/rules/page.tsx      # Official rules (static)
│   │   ├── profile/entries/page.tsx        # Entry stats + history (force-dynamic)
│   │   ├── privacy/page.tsx        # Privacy policy — 5 sections, substantive placeholder content
│   │   ├── terms/page.tsx          # Terms of service — 6 sections, substantive placeholder content
│   │   ├── sitemap.ts              # Dynamic sitemap — 8 static + ebook/sample/service URLs
│   │   └── robots.ts               # Disallows /admin/ and /profile/
│   ├── components/
│   │   ├── admin/                  # Admin-specific components (sidebar, forms, tables)
│   │   ├── billing/                # Billing components (checkout button, download button, pricing cards, order history, subscription management)
│   │   ├── sweepstakes/            # EntryBadge, MultiplierBanner, LeadCapturePopup, LeadCapturePopupWrapper, CountdownTimer
│   │   ├── marketplace/            # ServiceApproveButton (admin approve action), ServiceWaitlistCTA (coming-soon lead capture toggle)
│   │   ├── free/                   # LeadCaptureFormFree (sample product lead capture form)
│   │   ├── library/                # Library page components (card, filters, search, sort, load-more, filter-sheet-trigger)
│   │   ├── ebook/                  # E-book detail components (detail view, preview button, checkout integration)
│   │   ├── auth/
│   │   │   └── LoginForm.tsx       # Login state machine (client component)
│   │   ├── layout/
│   │   │   ├── navbar.tsx          # Top nav (server component)
│   │   │   ├── navbar-auth.tsx     # Auth dropdown / sign-in button (client)
│   │   │   ├── mobile-nav.tsx      # Hamburger + Sheet slide-out (client)
│   │   │   └── footer.tsx          # Site footer (server component)
│   │   ├── profile/
│   │   │   └── profile-form.tsx    # Profile edit form with avatar upload (client)
│   │   ├── providers.tsx           # next-themes ThemeProvider wrapper
│   │   └── ui/                     # shadcn/ui auto-generated components
│   ├── emails/                     # React Email templates (ebook-purchase, membership-welcome, membership-charged, trial-ending, payment-failed, lead-capture-confirm, sample-product-confirm)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser Supabase client
│   │   │   ├── server.ts           # Server Supabase client (cookie-based)
│   │   │   └── admin.ts            # Service role client — never import in components
│   │   ├── utils/
│   │   │   ├── slugify.ts          # Slug generation utility
│   │   │   └── product-labels.ts   # Display label maps for category/scale/cost enums
│   │   ├── stripe.ts               # Lazy Stripe singleton + sync helpers + getOrCreateStripeCustomer
│   │   ├── membership.ts           # isActiveMember(userId) — server-only
│   │   ├── beehiiv.ts              # subscribeToBeehiiv / unsubscribeFromBeehiiv — non-blocking
│   │   ├── email.tsx               # sendEmail(template, to, data) — Resend + email_log — non-blocking
│   │   ├── coupon.ts               # validateCouponCode(code, userId) — shared coupon helper
│   │   ├── sweepstakes.ts          # Entry engine: calculateEntries, awardPurchaseEntries, awardLeadCaptureEntries, getActiveSweepstake
│   │   └── utils.ts                # cn() Tailwind class merge utility
│   └── middleware.ts               # Session refresh + route protection (includes /ebooks/download)
├── supabase/
│   ├── migrations/                 # 19 timestamped SQL migration files
│   ├── storage.md                  # Storage bucket configuration guide
│   └── auth-config.md              # Auth configuration guide
├── vercel.json                     # maxDuration: 60 for /api/webhooks/stripe; security headers on all routes
├── scripts/
│   └── verify-rls.ts               # RLS audit script — run with: npx tsx scripts/verify-rls.ts
├── docs/
│   ├── adr/                        # Architectural Decision Records
│   └── runbooks/                   # Operational runbooks
├── .env.local.example              # All required environment variable keys
├── components.json                 # shadcn/ui configuration
├── next.config.ts                  # Next.js config (wrapped with withSentryConfig)
├── sentry.client.config.ts
├── sentry.server.config.ts
└── sentry.edge.config.ts
```

## Environment Variables

All required variables are documented in `.env.local.example` with inline comments. Variables prefixed `NEXT_PUBLIC_` are safe to expose to the browser. All others are server-only.

## Key Documentation

- [Local dev setup runbook](docs/runbooks/runbook-local-dev-setup.md)
- [Database migrations runbook](docs/runbooks/runbook-database-migrations.md)
- [External tasks checklist](docs/runbooks/runbook-external-tasks.md)
- [Storage bucket configuration](supabase/storage.md)
- [Auth configuration](supabase/auth-config.md)
- [ADR-001: Three Supabase client variants](docs/adr/ADR-001-supabase-client-variants.md)
- [ADR-002: Database migration strategy](docs/adr/ADR-002-migration-strategy.md)
- [ADR-003: Auth strategy](docs/adr/ADR-003-auth-strategy.md)
- [ADR-004: shadcn/ui component library](docs/adr/ADR-004-shadcn-ui.md)
- [ADR-005: Server Actions for admin forms](docs/adr/ADR-005-server-actions-admin-forms.md)
- [ADR-006: Lazy Stripe singleton](docs/adr/ADR-006-lazy-stripe-singleton.md)
- [ADR-007: Webhook idempotency via Postgres RPC](docs/adr/ADR-007-webhook-idempotency.md)
- [ADR-008: Stripe v22 API adaptation](docs/adr/ADR-008-stripe-v22-adaptation.md)
- [ADR-009: Pure function design for calculateEntries](docs/adr/ADR-009-pure-function-entry-calculation.md)
- [ADR-010: Lead capture email confirmation flow](docs/adr/ADR-010-lead-capture-email-confirmation.md)
- [ADR-011: Materialized view export via SECURITY DEFINER RPC](docs/adr/ADR-011-export-rpc-security-definer.md)
- [API Reference](docs/api-reference.md)
- [Stripe webhook setup runbook](docs/runbooks/stripe-webhook-setup.md)
- [Sweepstakes operations runbook](docs/runbooks/sweepstakes-operations.md)
- [RLS audit runbook](docs/runbooks/runbook-rls-audit.md)
- [Pre-launch checklist](docs/runbooks/pre-launch-checklist.md)
