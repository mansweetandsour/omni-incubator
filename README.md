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

   All other variables are optional for local development (the app no-ops gracefully when Sentry, Stripe, Beehiiv, Resend, and Rewardful keys are absent).

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
│   │   │       └── [others]/       # Placeholder pages (ebooks, orders, users, etc.)
│   │   ├── actions/
│   │   │   ├── products.ts         # Server Actions: createProduct, updateProduct, archiveProduct
│   │   │   └── services.ts         # Server Actions: createService, updateService, archiveService
│   │   ├── api/
│   │   │   ├── admin/ebooks/[id]/upload/route.ts        # Multipart file upload (admin only)
│   │   │   ├── ebooks/[id]/preview/route.ts             # Public preview PDF redirect
│   │   │   ├── ebooks/[id]/download/route.ts            # Ownership check + signed URL + 307 redirect
│   │   │   ├── library/products/route.ts                # Paginated library listing
│   │   │   ├── auth/callback/route.ts                   # Google OAuth PKCE callback
│   │   │   ├── checkout/membership/route.ts             # Subscription checkout session
│   │   │   ├── checkout/ebook/route.ts                  # Ebook payment checkout session
│   │   │   ├── checkout/ebook-with-membership/route.ts  # Combined checkout session
│   │   │   ├── coupons/validate/route.ts                # Coupon validation
│   │   │   ├── webhooks/stripe/route.ts                 # Stripe webhook handler (idempotent)
│   │   │   ├── profile/orders/route.ts                  # Paginated order history
│   │   │   ├── profile/ebooks/route.ts                  # Owned ebook list
│   │   │   ├── profile/subscription/route.ts            # Subscription status
│   │   │   └── subscription/portal/route.ts             # Stripe Billing Portal session
│   │   ├── layout.tsx              # Root layout — navbar, footer, providers
│   │   ├── page.tsx                # Homepage (placeholder, Phase 6 content)
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
│   │   ├── marketplace/page.tsx    # Coming Soon + service grid + email capture
│   │   ├── pricing/page.tsx        # Membership pricing page with toggle
│   │   ├── ebooks/download/[id]/page.tsx   # Download page (auth-protected)
│   │   ├── sweepstakes/page.tsx    # Placeholder (Phase 4A)
│   │   ├── privacy/page.tsx        # Placeholder (Phase 6)
│   │   └── terms/page.tsx          # Placeholder (Phase 6)
│   ├── components/
│   │   ├── admin/                  # Admin-specific components (sidebar, forms, tables)
│   │   ├── billing/                # Billing components (checkout button, download button, pricing cards, order history, subscription management)
│   │   ├── library/                # Library page components (card, filters, search, sort, load-more)
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
│   ├── emails/                     # React Email templates (ebook-purchase, membership-welcome, membership-charged, trial-ending, payment-failed)
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
│   │   └── utils.ts                # cn() Tailwind class merge utility
│   └── middleware.ts               # Session refresh + route protection (includes /ebooks/download)
├── supabase/
│   ├── migrations/                 # 16 timestamped SQL migration files
│   ├── storage.md                  # Storage bucket configuration guide
│   └── auth-config.md              # Auth configuration guide
├── vercel.json                     # maxDuration: 60 for /api/webhooks/stripe
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
- [API Reference](docs/api-reference.md)
- [Stripe webhook setup runbook](docs/runbooks/stripe-webhook-setup.md)
