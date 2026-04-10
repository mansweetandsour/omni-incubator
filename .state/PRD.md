# PRD — Phase 1: Foundation

## Phase Goal
Stand up the complete project foundation so that a user can sign up with email OTP or Google OAuth, see their auto-generated profile, and edit it. All database schema, auth, layout shell, and tooling must be in place so later phases can build on a solid base.

## Requirements

### R1 — Project Bootstrap
- Init Next.js 14 App Router project with TypeScript, Tailwind CSS, ESLint, and `src/` directory structure
- Install and configure shadcn/ui with: Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton components
- All application code lives under `src/`

### R2 — Supabase Client Setup
- `src/lib/supabase/client.ts` — browser client using `createBrowserClient` from `@supabase/ssr`
- `src/lib/supabase/server.ts` — server client using `createServerClient` from `@supabase/ssr` (reads cookies from Next.js headers)
- `src/lib/supabase/admin.ts` — service role client using `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS — used only in webhook handlers and admin operations)

### R3 — Database Migrations
Write ALL SQL migration files in `supabase/migrations/` as timestamped files. Must include every table, trigger, function, index, view, and seed data from §2 of the blueprint:

**Tables to create (in dependency order):**
1. `profiles` (references auth.users)
2. `products` (with product_type enum)
3. `ebooks` (references products)
4. `services` (with service_rate_type enum, references products and profiles)
5. `orders` (with order_status enum, references profiles)
6. `order_items` (references orders, products)
7. `subscriptions` (references profiles, products)
8. `user_ebooks` (references profiles, ebooks, orders)
9. `sweepstakes`
10. `entry_multipliers` (references sweepstakes)
11. `coupons` (with coupon_entry_type enum, references sweepstakes)
12. `coupon_uses` (references coupons, profiles, orders)
13. `sweepstake_entries` (with entry_source enum, references sweepstakes, profiles, orders, order_items, products, coupons)
14. `lead_captures` (references profiles, sweepstakes, sample_products — deferred FK)
15. `sample_products` (references products)
16. `email_log` (references profiles)
17. `processed_stripe_events`
18. Deferred FK constraints: orders→coupons, sweepstake_entries→lead_captures, lead_captures→sample_products

**Functions and triggers:**
- `handle_new_user()` trigger on auth.users INSERT → auto-create profile with display_name and username
- `compute_member_price()` trigger on products BEFORE INSERT OR UPDATE OF price_cents → compute member_price_cents for ebooks
- `generate_order_number()` trigger on orders BEFORE INSERT → generate OMNI-YYYYMMDD-XXXXXXXX format
- `set_updated_at()` trigger applied to all tables with updated_at column

**Indexes:** All indexes from §2.7

**Materialized view:** `entry_verification` per §2.5 with unique index

**Seed data:** Membership products (monthly $15, annual $129) per §2.8

**RLS policies:** Enable RLS and create policies for every table per §15 of the blueprint

### R4 — Storage Buckets
Define Supabase Storage bucket configuration:
- `ebooks` — private (authenticated access only, signed URLs required)
- `ebook-previews` — public (direct URL access allowed)
- `sample-products` — private (signed URLs required)
- `avatars` — public (direct URL access allowed)
- `covers` — public (direct URL access allowed)

Document bucket names and access policies in a `supabase/storage.md` file for manual creation or migration.

### R5 — Auth: Email OTP
- `/login` page: single email input form → submit sends OTP via `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
- After submit: transition to OTP verification step — 6-digit code input
- Verify with `supabase.auth.verifyOtp({ email, token, type: 'email' })`
- On success: redirect to the page the user was trying to access (via `next` param) or `/library` as default
- Error states: invalid code, expired code (resend link)

### R6 — Auth: Google OAuth
- "Sign in with Google" button on `/login` page
- `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/api/auth/callback' } })`
- Callback route at `src/app/api/auth/callback/route.ts` — exchanges code for session, redirects to `/library` or `next` param

### R7 — Auth Middleware
- `src/middleware.ts` using `@supabase/ssr` to refresh sessions on every request
- Protected routes `/profile/*` and `/admin/*`: redirect to `/login?next={path}` if no session
- Admin routes additionally check `profiles.role = 'admin'` — return 403 page for authenticated non-admins
- Public routes pass through without session check

### R8 — Profile Page
- `/profile` route (server component + client form)
- Displays: display_name, username, bio, avatar_url, email (read-only from auth), phone, website
- Edit form with save button: all editable fields
- Username uniqueness check on save (query profiles where username = new value AND id != current user)
- On successful save: set `profile_complete = true` if display_name and username are filled
- Show success toast on save, error toast on failure
- Avatar upload to `avatars` bucket (generate public URL, store in profile)

### R9 — Layout Shell
- Root layout `src/app/layout.tsx`:
  - Nav bar: logo (Omni Incubator), links (Library `/library`, Pricing `/pricing`, Marketplace `/marketplace`, Sweepstakes `/sweepstakes`), auth state (logged in: avatar/username + dropdown with Profile, My E-books, Orders, Entries, Subscription, Sign Out; logged out: Sign In button)
  - Footer: links (Privacy `/privacy`, Terms `/terms`, Sweepstakes Rules `/sweepstakes/rules`), copyright
  - Mobile nav: hamburger button, slide-out sheet with same links
  - Multiplier banner slot: reserved div at top of layout (empty for now, wired in Phase 4A)
  - Rewardful JS snippet in `<head>`: `<script async src='https://r.wdfl.co/rw.js' data-rewardful={NEXT_PUBLIC_REWARDFUL_API_KEY}></script>`
  - Provider wrapper for shadcn/ui Toaster

### R10 — Sentry
- Install `@sentry/nextjs`
- Configure `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`
- Add `withSentryConfig` wrapper in `next.config.ts`
- Global error boundary in root layout
- Use `NEXT_PUBLIC_SENTRY_DSN` env var (gracefully no-ops when DSN is absent/empty)

### R11 — Environment Variables
- Create `.env.local.example` with all variables from §14 of the blueprint, with blank values and inline comments describing each var
- Document which are public (NEXT_PUBLIC_*) vs server-only

## Acceptance Criteria
1. `npm run dev` starts the server without errors
2. `/login` page renders and allows email submission (even without Supabase configured — shows UI, API call may fail gracefully)
3. All migration files exist in `supabase/migrations/` and are syntactically valid SQL
4. All three Supabase client variants exported correctly with TypeScript types
5. Root layout renders on all pages with nav, footer, and Rewardful snippet
6. Mobile nav opens and closes on hamburger click at ≤768px viewport
7. Middleware redirects unauthenticated users from `/profile/test` to `/login?next=/profile/test`
8. Middleware redirects unauthenticated users from `/admin/test` to `/login?next=/admin/test`
9. `src/middleware.ts` exists and handles session refresh
10. `.env.local.example` contains all 14 required environment variable keys
11. shadcn/ui components import without errors in a test page

## Out of Scope for Phase 1
- Actual Supabase project creation (EXTERNAL TASK E1 — human must do this)
- Google Cloud OAuth credentials (EXTERNAL TASK E3)
- Sentry project creation (EXTERNAL TASK E10)
- Any e-book, product, billing, or sweepstakes functionality
- Admin dashboard pages (Phase 2)
- Homepage content beyond layout shell
- Production deployment
