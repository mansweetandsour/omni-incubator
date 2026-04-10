# Runbook: Local Development Setup

This runbook walks a new developer through getting the Omni Incubator project running locally from scratch.

---

## Prerequisites

| Tool | Minimum version | Install |
|---|---|---|
| Node.js | 20 | https://nodejs.org or `nvm install 20` |
| npm | 10 | Bundled with Node.js 20 |
| Supabase CLI | latest | `brew install supabase/tap/supabase` |
| Git | any | https://git-scm.com |

You also need a Supabase project. If you do not have one yet, see the [External Tasks runbook](runbook-external-tasks.md) for task E1.

---

## Step 1 — Clone the repository

```bash
git clone <repo-url>
cd omni-incubator
```

---

## Step 2 — Install dependencies

```bash
npm install
```

---

## Step 3 — Configure environment variables

```bash
cp .env.local.example .env.local
```

Open `.env.local` and fill in the following variables. The remaining variables are optional for local development.

**Required to start the app:**

| Variable | Where to find it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → anon / public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → service_role key |
| `NEXT_PUBLIC_SITE_URL` | Set to `http://localhost:3000` for local dev |

**Optional (app no-ops gracefully when absent):**
- `NEXT_PUBLIC_SENTRY_DSN` — error monitoring
- `SENTRY_AUTH_TOKEN` — only needed for production builds with source map upload
- `NEXT_PUBLIC_REWARDFUL_API_KEY` — affiliate tracking script
- Stripe, Beehiiv, Resend, Upstash variables (required in Phase 3 / Phase 4A)

---

## Step 4 — Apply database migrations

Log in to the Supabase CLI and link your project:

```bash
supabase login
supabase link --project-ref <your-project-ref>
```

Your project ref is the subdomain from your Supabase project URL (e.g., `abcdefghijklmno` from `https://abcdefghijklmno.supabase.co`).

Push all migrations to the linked project:

```bash
supabase db push
```

For a clean slate (drops everything and re-applies all migrations):

```bash
supabase db reset
```

After migrations run, the database will contain all 18 tables, all triggers, the `entry_verification` materialized view, and seed data (two membership products).

---

## Step 5 — Create storage buckets

Supabase storage buckets cannot be created via migrations. Create them manually in the Supabase Dashboard under Storage, or via the Supabase Management API.

Required buckets:

| Bucket name | Access |
|---|---|
| `ebooks` | Private |
| `ebook-previews` | Public |
| `sample-products` | Private |
| `avatars` | Public |
| `covers` | Public |

Full details (CORS config, file path conventions, signed URL usage) are in [supabase/storage.md](../../supabase/storage.md).

---

## Step 6 — Configure Supabase Auth

Follow the instructions in [supabase/auth-config.md](../../supabase/auth-config.md):

1. Enable Email OTP, disable Magic Links.
2. Set Site URL to `http://localhost:3000` in Supabase Dashboard → Authentication → URL Configuration.
3. Add `http://localhost:3000/api/auth/callback` to the Redirect URLs allowlist.
4. Optionally configure Google OAuth (see External Task E3).

---

## Step 7 — Start the development server

```bash
npm run dev
```

The app is available at [http://localhost:3000](http://localhost:3000).

---

## Verification checklist

- [ ] `http://localhost:3000` loads without errors in the browser console
- [ ] `/login` renders the email input form
- [ ] Submitting a valid email address triggers an OTP email from Supabase
- [ ] Entering the OTP code redirects to `/library`
- [ ] `/profile` redirects to `/login?next=/profile` when not authenticated
- [ ] `/admin/anything` redirects to `/login?next=/admin/anything` when not authenticated

---

## Common issues

**`NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing**
The app will start but all Supabase calls will throw. Ensure `.env.local` exists and has the correct values.

**TypeScript errors after pulling new code**
Run `node node_modules/typescript/lib/tsc.js --noEmit` to check for type errors. If `npx tsc` has a broken symlink in your environment, use the `node` invocation directly.

**`supabase db push` fails with "already applied"**
The migration has already been applied to your project. This is expected if you previously ran `supabase db push` or `supabase db reset`. Add a new migration file for any schema changes — do not edit existing migration files.

**Build fails with Sentry source map upload error**
Leave `SENTRY_AUTH_TOKEN` blank in `.env.local`. The `withSentryConfig` wrapper skips source map upload when the token is absent.
