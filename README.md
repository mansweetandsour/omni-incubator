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

## Project Structure

```
omni-incubator/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout — navbar, footer, providers
│   │   ├── page.tsx                # Homepage (placeholder, Phase 6 content)
│   │   ├── globals.css             # Tailwind directives + shadcn/ui CSS variables
│   │   ├── error.tsx               # Root error boundary (Sentry)
│   │   ├── not-found.tsx           # 404 page
│   │   ├── 403/page.tsx            # 403 Forbidden (admin access denied)
│   │   ├── login/page.tsx          # Email OTP + Google OAuth
│   │   ├── profile/page.tsx        # Profile view + edit form
│   │   ├── library/page.tsx        # Placeholder (Phase 2)
│   │   ├── pricing/page.tsx        # Placeholder (Phase 3)
│   │   ├── marketplace/page.tsx    # Placeholder (Phase 5)
│   │   ├── sweepstakes/page.tsx    # Placeholder (Phase 4A)
│   │   ├── privacy/page.tsx        # Placeholder (Phase 6)
│   │   ├── terms/page.tsx          # Placeholder (Phase 6)
│   │   └── api/auth/callback/
│   │       └── route.ts            # Google OAuth PKCE callback
│   ├── components/
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
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts           # Browser Supabase client
│   │   │   ├── server.ts           # Server Supabase client (cookie-based)
│   │   │   └── admin.ts            # Service role client — never import in components
│   │   └── utils.ts                # cn() Tailwind class merge utility
│   └── middleware.ts               # Session refresh + route protection
├── supabase/
│   ├── migrations/                 # 14 timestamped SQL migration files
│   ├── storage.md                  # Storage bucket configuration guide
│   └── auth-config.md              # Auth configuration guide
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
