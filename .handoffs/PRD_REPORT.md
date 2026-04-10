# PRD Report — Phase 1: Foundation
**Mode:** Fortification
**Date:** 2026-04-09
**Phase:** 1 of 6

---

## 1. Status

**WARN**

Requirements are substantially complete, consistent with the blueprint, and ready for the Architect to proceed. Four advisory findings are noted below. None are blockers — the pipeline may continue. The Architect should be given this report along with the findings so the SPEC.md addresses them explicitly.

---

## 2. Fortified Requirements

### FR1 — Project Bootstrap
The Architect must initialize a Next.js 14 project using the App Router with TypeScript, Tailwind CSS, and ESLint. All application source files must reside under a `src/` directory. The project must run without errors on `npm run dev` at the end of this phase.

shadcn/ui must be initialized and the following components installed and importable without errors: Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton.

### FR2 — Supabase Client Setup
Three Supabase client modules must be created:

- `src/lib/supabase/client.ts` — browser-safe client using `createBrowserClient` from `@supabase/ssr`. Reads `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- `src/lib/supabase/server.ts` — server-side client using `createServerClient` from `@supabase/ssr`. Reads cookies from the Next.js request context. For use in Server Components, Server Actions, and Route Handlers.
- `src/lib/supabase/admin.ts` — service-role client using `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS. Used exclusively in webhook handlers, admin API routes, and the `handle_new_user` trigger's application-side counterpart. Must NOT be imported in any component or browser context.

All three modules must export their clients with correct TypeScript types (using the generated Supabase types when available, or `any` as a placeholder until Phase 2 generates types).

### FR3 — Database Migrations
All SQL migration files must be written in `supabase/migrations/` as sequentially timestamped files (e.g., `20240101000001_initial_schema.sql`). Each file must be syntactically valid SQL.

The following must be covered, in dependency order, across one or more migration files:

**Tables (18 total):**
1. `profiles` — references `auth.users(id) ON DELETE CASCADE`
2. `products` — with `product_type` ENUM (`ebook`, `membership_monthly`, `membership_annual`, `service`)
3. `ebooks` — references `products(id) ON DELETE CASCADE`
4. `services` — with `service_rate_type` ENUM (`hourly`, `fixed`, `monthly`, `custom`); nullable FKs to `products` and `profiles`
5. `orders` — with `order_status` ENUM (`pending`, `completed`, `failed`); references `profiles(id)`
6. `order_items` — references `orders(id) ON DELETE CASCADE`, `products(id)`
7. `subscriptions` — references `profiles(id) ON DELETE CASCADE`, `products(id)`
8. `user_ebooks` — references `profiles(id) ON DELETE CASCADE`, `ebooks(id)`, `orders(id)` (nullable)
9. `sweepstakes`
10. `entry_multipliers` — references `sweepstakes(id) ON DELETE CASCADE`
11. `coupons` — with `coupon_entry_type` ENUM (`multiplier`, `fixed_bonus`); nullable FK to `sweepstakes`
12. `coupon_uses` — references `coupons(id) ON DELETE CASCADE`, `profiles(id)`, `orders(id)` (nullable)
13. `sweepstake_entries` — with `entry_source` ENUM (`purchase`, `non_purchase_capture`, `admin_adjustment`, `coupon_bonus`); nullable FKs to `profiles`, `orders`, `order_items`, `products`, `coupons`
14. `lead_captures` — nullable FKs to `profiles`, `sweepstakes`; deferred FK to `sample_products`
15. `sample_products` — nullable FK to `products`
16. `email_log` — nullable FK to `profiles`
17. `processed_stripe_events`
18. Deferred FK constraints applied via `ALTER TABLE` after all tables exist:
    - `orders.coupon_id → coupons(id)`
    - `sweepstake_entries.lead_capture_id → lead_captures(id)`
    - `lead_captures.sample_product_id → sample_products(id)`

**Functions and triggers (4 required):**
- `public.handle_new_user()` — SECURITY DEFINER, fired AFTER INSERT on `auth.users`. Auto-creates `profiles` row with `display_name` derived from `raw_user_meta_data->>'full_name'` or email prefix, and a unique `username` appended with a 4-char UUID fragment. Also links any pre-existing `lead_captures` rows by email.
- `public.compute_member_price()` — fired BEFORE INSERT OR UPDATE OF `price_cents` on `products`. Sets `member_price_cents = FLOOR(price_cents * 0.5)` when `type = 'ebook'`.
- `public.generate_order_number()` — fired BEFORE INSERT on `orders` WHEN `order_number IS NULL`. Generates `OMNI-YYYYMMDD-XXXXXXXX` format using 8 uppercase hex chars from MD5 of a new UUID.
- `public.set_updated_at()` — fired BEFORE UPDATE on every table with an `updated_at` column. Applied dynamically via a DO block iterating over `information_schema.columns`.

**Indexes:** All indexes from §2.7 of the blueprint must be created, covering: products, ebooks, orders, subscriptions, sweepstake_entries, lead_captures, sample_products, coupons, entry_multipliers.

**Unique partial indexes:**
- `idx_subscriptions_active_user` on `subscriptions(user_id) WHERE status IN ('trialing', 'active')` — prevents double-subscription race condition.
- `idx_sweepstakes_single_active` on `sweepstakes((true)) WHERE status = 'active'` — enforces single active sweepstake at DB level.

**Materialized view:** `public.entry_verification` per §2.5 of the blueprint, with unique index `idx_entry_verification_pk ON entry_verification(user_id, sweepstake_id)`.

**RLS:** Enable RLS on every table and create policies for all access patterns per §15 of the blueprint. Admin check pattern: `(SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'`. The profiles UPDATE policy must prevent users from modifying their own `role` column using `WITH CHECK`.

**Seed data:** Insert two membership products per §2.8 of the blueprint:
- `omni-membership-monthly` — type `membership_monthly`, price_cents 1500
- `omni-membership-annual` — type `membership_annual`, price_cents 12900

### FR4 — Storage Buckets
The following Supabase Storage buckets must be documented. Because bucket creation via SQL migration is not natively supported by the Supabase CLI as of Next.js/Supabase launch tooling, the Architect must create a `supabase/storage.md` file that documents each bucket's name, access level, and CORS requirements for the human operator to create via the Supabase Dashboard or a setup script.

| Bucket name | Access | Signed URL required |
|---|---|---|
| `ebooks` | Private | Yes (1hr expiry, generated on demand in API) |
| `ebook-previews` | Public | No |
| `sample-products` | Private | Yes (1hr expiry) |
| `avatars` | Public | No |
| `covers` | Public | No |

CORS must permit `https://omniincubator.org` (and `http://localhost:3000` for development).

### FR5 — Email OTP Authentication
The `/login` page must:
- Accept an email address input
- On submit, call `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`
- Transition to a 6-digit OTP code input step (same page, no full reload)
- On code submission, call `supabase.auth.verifyOtp({ email, token, type: 'email' })`
- On success, redirect to the value of the `next` query parameter if present and safe (starts with `/`), otherwise redirect to `/library`
- Display user-facing error states for: invalid code, expired code (with a "resend" link that re-submits the original email)

The Supabase Auth configuration note (OTP mode, 10-minute expiry, magic link disabled) must be included in `supabase/storage.md` or a separate `supabase/auth-config.md` as an external task note for the operator.

### FR6 — Google OAuth Authentication
The `/login` page must include a "Sign in with Google" button that calls:
```
supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${NEXT_PUBLIC_SITE_URL}/api/auth/callback` } })
```

A callback route handler at `src/app/api/auth/callback/route.ts` must:
- Extract the `code` query parameter
- Exchange it for a session using `supabase.auth.exchangeCodeForSession(code)`
- Redirect to the value of the `next` query parameter if present, otherwise to `/library`
- Handle errors gracefully (redirect to `/login?error=auth_failed` on failure)

### FR7 — Auth Middleware
`src/middleware.ts` must:
- Use `@supabase/ssr` to refresh the Supabase session on every request (required for SSR cookie-based auth)
- Protect `/profile/*` routes: redirect unauthenticated users to `/login?next={original path}`
- Protect `/admin/*` routes: redirect unauthenticated users to `/login?next={original path}`; redirect authenticated non-admin users to a `/403` page or render a 403 response
- Admin role check reads `profiles.role` via the server client
- All other routes pass through without a session check

The middleware config matcher must cover `/((?!_next/static|_next/image|favicon.ico).*)` or equivalent to avoid running on static assets.

### FR8 — Profile Page
The `/profile` route must be a protected page (middleware-enforced) that:
- Loads the authenticated user's profile from `profiles` using the server client
- Displays: `display_name`, `username`, `bio`, `avatar_url` (as an image), email (read-only, sourced from Supabase auth user, not the profile table), `phone`, `website`
- Provides an edit form (client component) for all editable fields with a Save button
- On save, performs a username uniqueness check: query `profiles WHERE username = newValue AND id != currentUserId`; if a conflict exists, display an inline error without submitting
- On successful save: update the profile row; if `display_name` is non-empty AND `username` is non-empty, set `profile_complete = true`
- Displays a success toast on save; error toast on failure
- Supports avatar upload: user selects an image file, which is uploaded to the `avatars` Storage bucket under a path like `{userId}/avatar.{ext}`; the resulting public URL is stored in `profiles.avatar_url`

### FR9 — Root Layout Shell
`src/app/layout.tsx` must render:
- **Nav bar:** Logo ("Omni Incubator", links to `/`), navigation links to `/library`, `/pricing`, `/marketplace`, `/sweepstakes`. Auth-conditional right section: when logged in — avatar/username with a dropdown containing Profile, My E-books, Orders, Entries, Subscription, Sign Out; when logged out — a "Sign In" button linking to `/login`.
- **Footer:** Links to `/privacy`, `/terms`, `/sweepstakes/rules`; copyright line.
- **Mobile nav:** Hamburger button visible at ≤768px viewport, triggering a slide-out Sheet component containing the same navigation links and auth state. Must open and close correctly.
- **Multiplier banner slot:** An empty, reserved `<div id="multiplier-banner-slot" />` positioned above the nav bar, to be populated in Phase 4A. Must not produce visible UI in Phase 1.
- **Rewardful script:** `<script async src="https://r.wdfl.co/rw.js" data-rewardful={process.env.NEXT_PUBLIC_REWARDFUL_API_KEY}></script>` in the `<head>`. Must load without blocking; must be a no-op when `NEXT_PUBLIC_REWARDFUL_API_KEY` is absent.
- **Toaster:** shadcn/ui `<Toaster />` provider component included in the layout for toast notifications to function site-wide.

### FR10 — Sentry Error Monitoring
Sentry must be installed via `@sentry/nextjs`. The following files must exist and be correctly configured:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `next.config.ts` (or `next.config.js`) must wrap the Next.js config with `withSentryConfig`

All Sentry initialization must read `NEXT_PUBLIC_SENTRY_DSN` and gracefully no-op (do not throw) when the value is absent or empty. A global error boundary must be present in the root layout.

`SENTRY_AUTH_TOKEN` is used for source map uploads during build — must be referenced in the Sentry config but not required for local dev.

### FR11 — Environment Variable Documentation
A `.env.local.example` file must be created in the project root with all 14 environment variables from §14 of the blueprint. Each variable must have blank value and a one-line inline comment explaining its purpose and where to find it. Variables must be clearly grouped as public (`NEXT_PUBLIC_*`) vs server-only (no prefix).

The 14 required variables are:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_MONTHLY_PRICE_ID
STRIPE_ANNUAL_PRICE_ID
BEEHIIV_API_KEY
BEEHIIV_PUBLICATION_ID
RESEND_API_KEY
RESEND_FROM_EMAIL
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
NEXT_PUBLIC_REWARDFUL_API_KEY
NEXT_PUBLIC_SENTRY_DSN
SENTRY_AUTH_TOKEN
NEXT_PUBLIC_SITE_URL
```

Note: The blueprint §14 lists 14 lines but the actual count is 18 distinct variables. The acceptance criterion "14 required keys" in the PRD.md should be treated as referring to all keys in §14, not literally 14. The `.env.local.example` must contain ALL 18 keys listed above.

---

## 3. Acceptance Criteria

1. `npm run dev` completes without errors and the dev server is reachable at `http://localhost:3000`.
2. The `/login` page renders an email input form. Submitting a valid email transitions to the OTP code input step without a full page reload.
3. After OTP verification succeeds (mocked or real), the user is redirected to `/library` (or the `next` param if present).
4. The "Sign in with Google" button is present on `/login` and calls the Supabase OAuth flow. The callback route at `/api/auth/callback` exists and handles the code exchange.
5. All migration files in `supabase/migrations/` are syntactically valid SQL (can be linted with `psql --dry-run` or the Supabase CLI `db lint` command).
6. All 18 tables from FR3 exist in the migration files: `profiles`, `products`, `ebooks`, `services`, `orders`, `order_items`, `subscriptions`, `user_ebooks`, `sweepstakes`, `entry_multipliers`, `coupons`, `coupon_uses`, `sweepstake_entries`, `lead_captures`, `sample_products`, `email_log`, `processed_stripe_events`.
7. The 4 required triggers exist in migrations: `on_auth_user_created`, `set_member_price`, `set_order_number`, `trg_set_updated_at` (on all tables with `updated_at`).
8. The materialized view `entry_verification` and its unique index exist in migrations.
9. Seed data for both membership products is present in migrations.
10. RLS is enabled on all 17 tables (excluding `processed_stripe_events` which uses service role), and policies per §15 of the blueprint are defined for each.
11. All three Supabase client modules exist at `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, and `src/lib/supabase/admin.ts` and export their respective clients without TypeScript errors.
12. `src/middleware.ts` exists and correctly redirects unauthenticated users from `/profile/test` to `/login?next=/profile/test`.
13. `src/middleware.ts` correctly redirects unauthenticated users from `/admin/test` to `/login?next=/admin/test`.
14. Authenticated non-admin users hitting `/admin/*` receive a 403 response or are redirected to a `/403` page (not silently redirected to `/login`).
15. The root layout renders on all pages with: nav bar (logo + 4 nav links + auth state), footer (3 links + copyright), and the Rewardful `<script>` tag in `<head>`.
16. The mobile nav hamburger button is visible at ≤768px viewport and opens/closes the Sheet panel correctly.
17. The multiplier banner slot div is present in the DOM but renders no visible UI.
18. The `/profile` page loads for an authenticated user and displays all profile fields. The edit form submits and updates the profile.
19. Username uniqueness check prevents saving a username already taken by another user and displays an inline error.
20. Avatar upload to the `avatars` Storage bucket succeeds and the resulting public URL is saved to `profiles.avatar_url`.
21. `profile_complete` is set to `true` when both `display_name` and `username` are non-empty after a save.
22. Sentry config files exist (`sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`). The app starts without errors when `NEXT_PUBLIC_SENTRY_DSN` is absent.
23. `next.config.ts` wraps the config with `withSentryConfig`.
24. `.env.local.example` exists at the project root and contains all 18 environment variable keys.
25. All 10 required shadcn/ui components (Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton) import without errors.
26. `supabase/storage.md` documents all 5 buckets with names, access levels, and CORS requirements.

---

## 4. Cross-Phase Dependencies

None — this is the first phase.

All decisions locked in by this phase that later phases must respect:
- **Auth strategy:** Email OTP + Google OAuth via Supabase Auth. No password-based auth.
- **Session management:** Cookie-based using `@supabase/ssr`. Server components use `createServerClient`; client components use `createBrowserClient`.
- **Admin detection:** `profiles.role = 'admin'` column. RLS policies use `(SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'`. No separate admin table.
- **Database conventions:** UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at` on all tables, soft-delete via `deleted_at` on primary entities.
- **Migration tooling:** Supabase CLI, sequential timestamped files in `supabase/migrations/`.
- **Storage paths:** Raw storage paths stored in DB (e.g., `ebooks/{product-uuid}/filename.pdf`), not signed URLs. Signed URLs generated on demand in API handlers (1hr expiry).
- **Source layout:** All app code under `src/`. Supabase config under `supabase/`.
- **Environment variables:** Pattern established in `.env.local.example` for §14 variables.
- **Error monitoring:** Sentry via `@sentry/nextjs`, graceful no-op when DSN absent.

---

## 5. Scope Boundaries

The following are explicitly OUT of scope for Phase 1:

- **Supabase project creation** — EXTERNAL TASK E1. The migrations are written but not run against a live database.
- **Google OAuth credentials** — EXTERNAL TASK E3. The code must work without them (OTP works independently).
- **Sentry project/DSN** — EXTERNAL TASK E10. Sentry must gracefully no-op when DSN is absent.
- **Stripe integration** — Phase 3. No checkout, billing, or Stripe API calls.
- **E-book, product, or library pages** — Phase 2. The nav links to `/library`, `/pricing`, etc. may render as empty pages or 404s.
- **Admin dashboard pages** — Phase 2. The `/admin` route may return a 403 or placeholder; the middleware guard is required but the dashboard itself is not.
- **Homepage content** — Phase 6. The `/` route is the layout shell only.
- **Sweepstakes functionality** — Phases 4A/4B. The nav link to `/sweepstakes` may point to an empty or placeholder page.
- **Lead capture popup** — Phase 4A.
- **Multiplier banner content** — Phase 4A. Only the slot div is placed in the layout.
- **Production deployment** — Phase 6.
- **Beehiiv, Resend, Upstash** integrations — Phases 3 and 4A.
- **RLS policy testing** — Phase 6 (task 6.6). Policies are written in Phase 1, but audit is Phase 6.

---

## 6. Findings

### WARN-1: `.env.local.example` variable count mismatch
**Risk: LOW | Advisory**

The PRD acceptance criterion states: "`.env.local.example` contains all 14 required environment variable keys." However, §14 of the blueprint contains 18 distinct environment variables, not 14. The number "14" appears to be a stale count from an earlier blueprint version. The Architect and Backend agent must use the count of 18 (all variables in §14) as the ground truth. The acceptance criterion has been corrected in Section 3 of this report (AC-24).

### WARN-2: `processed_stripe_events` RLS policy is ambiguous
**Risk: LOW | Advisory**

§15 of the blueprint shows `processed_stripe_events` as accessible only via service role. The PRD does not explicitly include it in the RLS policies list (R3), but R3 says "Enable RLS and create policies for every table per §15." For clarity: `processed_stripe_events` must have RLS enabled with no permissive policies (so only the service-role client, which bypasses RLS, can read/write it). The Architect must include this explicitly in the migration.

### WARN-3: Supabase Storage bucket creation via migration is not supported natively
**Risk: LOW | Advisory**

The Supabase CLI does not support creating Storage buckets via SQL migration files in the same way as schema changes. Buckets are managed via the Supabase Dashboard, the management API, or a setup script. The PRD correctly calls for a `supabase/storage.md` file documenting buckets for manual/scripted creation. However, the acceptance criteria do not include a test for whether buckets actually exist (they can't exist without a live Supabase project — EXTERNAL TASK E1). The Architect should also consider providing a `scripts/create-buckets.ts` setup script using the Supabase management API as an optional deliverable, to reduce manual operator work when E1 is complete.

### WARN-4: `handle_new_user` trigger references `lead_captures` table which may not exist at trigger creation time
**Risk: MEDIUM | Advisory**

The `handle_new_user` trigger function (§2.1 of blueprint) contains:
```sql
UPDATE public.lead_captures SET user_id = NEW.id WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;
```
This references `lead_captures`, which is created later in the migration order (after `sweepstakes` and before `sample_products`). The function itself is safe because PL/pgSQL functions are not validated at creation time — the table reference is only resolved at runtime. However, the Architect must ensure:
1. The trigger function is created AFTER `lead_captures` exists, OR
2. The migration is structured so the function body resolves correctly at runtime (PL/pgSQL late binding makes this safe as long as both are in the same migration run).

The cleanest approach is to create the function and trigger in a migration file that runs after `lead_captures` is created. The Architect should organize migration files to respect this ordering.
