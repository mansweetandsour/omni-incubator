# TASKS.md — Phase 1: Foundation
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 1 — Foundation

All tasks below are atomic, dependency-ordered, and independently executable. Each task specifies what to create/modify, inputs to read, and done-criteria.

---

## [BACKEND] Tasks

### B1 — Initialize Next.js 14 Project
**Depends on:** nothing
**Action:**
Run the following command in the working directory `/Users/mansour/Omni-incubator`:
```bash
npm create next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```
Accept all defaults. Do NOT use `--turbopack` flag — stick with webpack for Sentry compatibility.
After init, verify:
- `src/app/layout.tsx` exists
- `src/app/page.tsx` exists
- `tailwind.config.ts` exists
- `tsconfig.json` has `"strict": true` and `"paths": { "@/*": ["./src/*"] }`

**Done when:** `npm run dev` starts without errors and `http://localhost:3000` returns 200.

---

### B2 — Install Supabase Dependencies
**Depends on:** B1
**Action:**
```bash
npm install @supabase/ssr @supabase/supabase-js
```
**Done when:** Both packages appear in `package.json` dependencies.

---

### B3 — Create Supabase Client Modules
**Depends on:** B2
**Files to create:**

**`src/lib/supabase/client.ts`:**
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**`src/lib/supabase/server.ts`:**
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from Server Component — read-only, session refresh handled by middleware
          }
        },
      },
    }
  )
}
```

**`src/lib/supabase/admin.ts`:**
```typescript
import { createClient } from '@supabase/supabase-js'

// WARNING: bypasses RLS. Never import in components or browser bundles.
// Use only in: webhook handlers, admin API routes, server-only scripts.
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
```

**Done when:** All three files exist, TypeScript compiler produces no errors on `npm run build` (or `tsc --noEmit`).

---

### B4 — Write Database Migration Files
**Depends on:** B1 (for `supabase/` directory at project root)
**Action:** Create the `supabase/migrations/` directory and write 14 SQL files exactly as specified in SPEC.md §5. File names and contents:

1. `supabase/migrations/20240101000001_enums.sql` — all 5 ENUM types
2. `supabase/migrations/20240101000002_profiles.sql` — profiles table
3. `supabase/migrations/20240101000003_products_ebooks.sql` — products + ebooks tables
4. `supabase/migrations/20240101000004_services.sql` — services table
5. `supabase/migrations/20240101000005_orders_billing.sql` — orders, order_items, subscriptions, user_ebooks tables + unique partial index on subscriptions
6. `supabase/migrations/20240101000006_sweepstakes_core.sql` — sweepstakes, entry_multipliers, coupons, coupon_uses, sweepstake_entries tables + unique partial index on sweepstakes
7. `supabase/migrations/20240101000007_lead_captures_samples.sql` — lead_captures + sample_products tables
8. `supabase/migrations/20240101000008_email_stripe_tables.sql` — email_log + processed_stripe_events tables
9. `supabase/migrations/20240101000009_deferred_fks.sql` — 3 ALTER TABLE ADD CONSTRAINT statements
10. `supabase/migrations/20240101000010_functions_triggers.sql` — all 4 functions + triggers (set_updated_at, compute_member_price, generate_order_number, handle_new_user)
11. `supabase/migrations/20240101000011_indexes.sql` — all indexes from §2.7 of blueprint
12. `supabase/migrations/20240101000012_materialized_views.sql` — entry_verification view + unique index
13. `supabase/migrations/20240101000013_rls_policies.sql` — full RLS from SPEC.md §6
14. `supabase/migrations/20240101000014_seed_data.sql` — 2 membership product INSERT statements

Critical ordering notes:
- ENUMs (file 1) must be created before any table that uses them
- `lead_captures` (file 7) must be created before `handle_new_user` function (file 10)
- Deferred FKs (file 9) must run after ALL tables exist
- `compute_member_price` trigger function in file 10 is OK before seed data (file 14) because it fires on INSERT

**Done when:** All 14 files exist in `supabase/migrations/`. Each file is syntactically valid SQL (no syntax errors). Can be verified with `cat` inspection or `psql --dry-run` if a local Postgres is available.

---

### B5 — Create Auth Middleware
**Depends on:** B3
**File to create:** `src/middleware.ts`

Full implementation as specified in SPEC.md §7. Key points:
- Creates a new `createServerClient` inline (not importing from `src/lib/supabase/server.ts`) to properly handle cookie read/write in middleware context
- Calls `supabase.auth.getUser()` to refresh session
- `/profile/*` — redirect to `/login?next={path}` if no user
- `/admin/*` — redirect to `/login?next={path}` if no user; redirect to `/403` if user but `role !== 'admin'`
- Matcher excludes `_next/static`, `_next/image`, `favicon.ico`, and image files

**Done when:** File exists at `src/middleware.ts`. Manual test: navigate to `/profile/test` without a session → should redirect to `/login?next=/profile/test`.

---

### B6 — Create Google OAuth Callback Route
**Depends on:** B3
**File to create:** `src/app/api/auth/callback/route.ts`

Full implementation as specified in SPEC.md §8. Key points:
- `GET` handler only
- Extracts `code` from URL params
- Calls `supabase.auth.exchangeCodeForSession(code)`
- Validates `next` param (must start with `/`) before redirecting
- On error: redirect to `/login?error=auth_failed`

**Done when:** File exists at the correct path. Route handler is importable without TypeScript errors.

---

### B7 — Create `.env.local.example`
**Depends on:** B1
**File to create:** `.env.local.example` at project root

Contents (all 18 variables with inline comments):
```env
# ─── Supabase ────────────────────────────────────────────────────────────────
# Found in: Supabase Dashboard → Project Settings → API
NEXT_PUBLIC_SUPABASE_URL=                  # Your Supabase project URL (https://xxx.supabase.co)
NEXT_PUBLIC_SUPABASE_ANON_KEY=             # Public anon key — safe to expose to browser
SUPABASE_SERVICE_ROLE_KEY=                 # Service role key — server only, bypasses RLS. NEVER expose client-side.

# ─── Stripe ──────────────────────────────────────────────────────────────────
# Found in: Stripe Dashboard → Developers → API Keys
STRIPE_SECRET_KEY=                         # Secret key — server only (sk_test_... or sk_live_...)
STRIPE_WEBHOOK_SECRET=                     # Webhook signing secret — from Stripe Dashboard → Webhooks → endpoint
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=        # Publishable key — safe to expose to browser (pk_test_... or pk_live_...)
STRIPE_MONTHLY_PRICE_ID=                   # Stripe Price ID for monthly membership (price_...)
STRIPE_ANNUAL_PRICE_ID=                    # Stripe Price ID for annual membership (price_...)

# ─── Beehiiv ─────────────────────────────────────────────────────────────────
# Found in: Beehiiv Dashboard → Settings → Integrations → API
BEEHIIV_API_KEY=                           # Beehiiv API key for newsletter subscription management
BEEHIIV_PUBLICATION_ID=                    # Beehiiv publication ID (pub_...)

# ─── Resend (transactional email) ────────────────────────────────────────────
# Found in: Resend Dashboard → API Keys
RESEND_API_KEY=                            # Resend API key for sending transactional emails (re_...)
RESEND_FROM_EMAIL=                         # Verified sender address (e.g. hello@omniincubator.org)

# ─── Upstash Redis (rate limiting) ───────────────────────────────────────────
# Found in: Upstash Console → Redis database → REST API
UPSTASH_REDIS_REST_URL=                    # Upstash Redis REST URL for rate limiting lead capture endpoint
UPSTASH_REDIS_REST_TOKEN=                  # Upstash Redis REST token (server only)

# ─── Rewardful (affiliate tracking) ─────────────────────────────────────────
# Found in: Rewardful Dashboard → Settings → General → API Key
NEXT_PUBLIC_REWARDFUL_API_KEY=             # Rewardful JS snippet key — safe to expose to browser

# ─── Sentry (error monitoring) ───────────────────────────────────────────────
# Found in: Sentry Dashboard → Project Settings → Client Keys (DSN)
NEXT_PUBLIC_SENTRY_DSN=                    # Sentry DSN — safe to expose. App no-ops gracefully when empty.
SENTRY_AUTH_TOKEN=                         # Sentry auth token for source map uploads during CI/build (server only)

# ─── App ─────────────────────────────────────────────────────────────────────
NEXT_PUBLIC_SITE_URL=http://localhost:3000 # Full URL of the app. Change to https://omniincubator.org in production.
```

**Done when:** File exists at `.env.local.example` with all 18 keys.

---

### B8 — Create Storage Bucket Documentation
**Depends on:** B1
**Files to create:**

**`supabase/storage.md`:**
```markdown
# Supabase Storage Buckets

Buckets cannot be created via SQL migration files. Create these manually via the
Supabase Dashboard (Storage section) or the Supabase Management API.

## Required Buckets

| Bucket Name      | Access  | Signed URL Required | Notes                              |
|------------------|---------|--------------------|------------------------------------|
| ebooks           | Private | Yes (1hr expiry)   | PDF/EPUB downloads — sign on demand |
| ebook-previews   | Public  | No                 | Free preview files                  |
| sample-products  | Private | Yes (1hr expiry)   | Free lead magnet downloads          |
| avatars          | Public  | No                 | User profile photos                 |
| covers           | Public  | No                 | E-book and product cover images     |

## CORS Configuration

Apply to all buckets:
- Allowed origins: `https://omniincubator.org`, `http://localhost:3000`
- Allowed methods: `GET, POST, PUT, DELETE`
- Allowed headers: `*`

## File Path Conventions

- Ebooks: `ebooks/{product-uuid}/{filename}.pdf`
- Ebook previews: `ebook-previews/{product-uuid}/preview.pdf`
- Sample products: `sample-products/{sample-product-uuid}/{filename}.pdf`
- Avatars: `avatars/{user-uuid}/avatar.{ext}`
- Covers: `covers/{product-uuid}/cover.{ext}`

## Signed URL Generation

For private buckets, generate signed URLs in API route handlers:
\`\`\`typescript
const { data } = await adminClient.storage
  .from('ebooks')
  .createSignedUrl(filePath, 3600) // 1 hour expiry
\`\`\`

Never store signed URLs in the database — they expire. Store the raw path and sign on demand.
```

**`supabase/auth-config.md`:**
```markdown
# Supabase Auth Configuration (External Task E2)

Configure via Supabase Dashboard → Authentication → Settings:

## Email OTP Settings
- **Email OTP**: Enabled
- **Magic Links**: Disabled (use OTP mode only)
- **OTP Expiry**: 600 seconds (10 minutes)
- **Secure email change**: Enabled (recommended)

## Google OAuth (External Task E3)
1. Create a Google Cloud OAuth 2.0 Client ID at console.cloud.google.com
2. Add authorized redirect URI: `https://{your-supabase-project}.supabase.co/auth/v1/callback`
3. In Supabase Dashboard → Authentication → Providers → Google:
   - Client ID: (from Google Cloud Console)
   - Client Secret: (from Google Cloud Console)

## Rate Limiting (Supabase built-in)
- Configure in Supabase Dashboard → Authentication → Rate Limits
- Recommended: 5 OTP requests per hour per email (Supabase default is 3/hr)
```

**Done when:** Both files exist.

---

### B9 — Install and Configure Sentry
**Depends on:** B1
**Action:**
```bash
npm install @sentry/nextjs
```

Create the following files exactly as specified in SPEC.md §12:

**`sentry.client.config.ts`:**
```typescript
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    debug: false,
  });
}
```

**`sentry.server.config.ts`:**
```typescript
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    debug: false,
  });
}
```

**`sentry.edge.config.ts`:**
```typescript
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    debug: false,
  });
}
```

**`next.config.ts`** — replace the default Next.js config with:
```typescript
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Add any Next.js config here
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
});
```

**Done when:** All 3 Sentry config files exist. `npm run dev` starts without errors when `NEXT_PUBLIC_SENTRY_DSN` is not set.

---

## [FRONTEND] Tasks

### F1 — Initialize shadcn/ui
**Depends on:** B1
**Action:**
```bash
npx shadcn@latest init
```
When prompted:
- Style: New York
- Base color: zinc
- CSS variables: yes

Then install all 10 required components:
```bash
npx shadcn@latest add button card input dialog dropdown-menu badge toast tabs table sheet skeleton
```

All components install to `src/components/ui/`.

**Done when:** All 10 component files exist in `src/components/ui/`. Can run `import { Button } from '@/components/ui/button'` without error.

---

### F2 — Create 403 Page
**Depends on:** F1
**File to create:** `src/app/403/page.tsx`
```typescript
export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      <a href="/" className="text-primary underline">Go home</a>
    </div>
  )
}
```
**Done when:** File exists and renders at `/403`.

---

### F3 — Create Root Error Boundary
**Depends on:** F1, B9
**File to create:** `src/app/error.tsx`
```typescript
'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <button onClick={reset} className="text-primary underline">
        Try again
      </button>
    </div>
  )
}
```
**Done when:** File exists at `src/app/error.tsx`.

---

### F4 — Create Layout Components
**Depends on:** F1, B3
**Files to create:**

**`src/components/layout/footer.tsx`** (Server Component):
```typescript
export function Footer() {
  return (
    <footer className="border-t py-6 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <a href="/privacy" className="hover:text-foreground">Privacy</a>
          <a href="/terms" className="hover:text-foreground">Terms</a>
          <a href="/sweepstakes/rules" className="hover:text-foreground">Sweepstakes Rules</a>
        </div>
        <p>© {new Date().getFullYear()} Omni Incubator</p>
      </div>
    </footer>
  )
}
```

**`src/components/layout/navbar-auth.tsx`** (Client Component):
```typescript
'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'

interface NavbarAuthProps {
  user: User | null
  username?: string | null
  avatarUrl?: string | null
}

export function NavbarAuth({ user, username, avatarUrl }: NavbarAuthProps) {
  const router = useRouter()
  const supabase = createClient()

  if (!user) {
    return <Button variant="default" asChild><a href="/login">Sign In</a></Button>
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 text-sm font-medium hover:opacity-80">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
              {username?.charAt(0).toUpperCase() ?? user.email?.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="hidden sm:block">{username ?? 'Account'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild><a href="/profile">Profile</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href="/profile/ebooks">My E-books</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href="/profile/orders">Orders</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href="/profile/entries">Entries</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href="/profile/subscription">Subscription</a></DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignOut} className="text-destructive">
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**`src/components/layout/mobile-nav.tsx`** (Client Component):
```typescript
'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'

const navLinks = [
  { href: '/library', label: 'Library' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/sweepstakes', label: 'Sweepstakes' },
]

interface MobileNavProps {
  user: User | null
  username?: string | null
}

export function MobileNav({ user, username }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <nav className="flex flex-col gap-4 mt-8">
          {navLinks.map(link => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-lg font-medium hover:text-primary"
            >
              {link.label}
            </a>
          ))}
          <hr />
          {user ? (
            <>
              <a href="/profile" onClick={() => setOpen(false)} className="hover:text-primary">Profile</a>
              <a href="/profile/ebooks" onClick={() => setOpen(false)} className="hover:text-primary">My E-books</a>
              <a href="/profile/orders" onClick={() => setOpen(false)} className="hover:text-primary">Orders</a>
              <a href="/profile/entries" onClick={() => setOpen(false)} className="hover:text-primary">Entries</a>
              <a href="/profile/subscription" onClick={() => setOpen(false)} className="hover:text-primary">Subscription</a>
            </>
          ) : (
            <a href="/login" onClick={() => setOpen(false)} className="text-primary font-medium">Sign In</a>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
```

**`src/components/layout/navbar.tsx`** (Server Component):
```typescript
import { createClient } from '@/lib/supabase/server'
import { NavbarAuth } from './navbar-auth'
import { MobileNav } from './mobile-nav'

const navLinks = [
  { href: '/library', label: 'Library' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/sweepstakes', label: 'Sweepstakes' },
]

export async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let profile = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <a href="/" className="font-bold text-xl tracking-tight">Omni Incubator</a>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map(link => (
              <a key={link.href} href={link.href} className="text-muted-foreground hover:text-foreground transition-colors">
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NavbarAuth user={user} username={profile?.username} avatarUrl={profile?.avatar_url} />
          <MobileNav user={user} username={profile?.username} />
        </div>
      </div>
    </header>
  )
}
```

**Done when:** All 4 files exist without TypeScript errors.

---

### F5 — Update Root Layout
**Depends on:** F1, F4, B9
**File to modify:** `src/app/layout.tsx`

Replace the default Next.js layout with:
```typescript
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Omni Incubator",
  description: "E-books, community, sweepstakes — everything you need to build.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {process.env.NEXT_PUBLIC_REWARDFUL_API_KEY && (
          <script
            async
            src="https://r.wdfl.co/rw.js"
            data-rewardful={process.env.NEXT_PUBLIC_REWARDFUL_API_KEY}
          />
        )}
      </head>
      <body className={inter.className}>
        <div id="multiplier-banner-slot" />
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Toaster />
      </body>
    </html>
  );
}
```

**Note on Rewardful script:** The `{process.env.NEXT_PUBLIC_REWARDFUL_API_KEY && ...}` conditional ensures no script tag at all when the key is absent. This is cleaner than an empty `data-rewardful` attribute.

**Done when:** Root layout renders on all pages with nav, footer, and Toaster. Rewardful script present in DOM when env key is set.

---

### F6 — Create Login Page
**Depends on:** F1, B3
**File to create:** `src/app/login/page.tsx`

Client component implementing the two-step auth flow from SPEC.md §9:

```typescript
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type Step = 'email' | 'otp'

export default function LoginPage() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const nextParam = searchParams.get('next')
  const redirectTo = nextParam?.startsWith('/') ? nextParam : '/library'

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setStep('otp')
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      router.push(redirectTo)
    }
  }

  const handleResend = async () => {
    setError(null)
    await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  }

  const handleGoogleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${redirectTo}`,
      },
    })
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to Omni Incubator</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Enter your email to receive a sign-in code.'
              : `Enter the 6-digit code sent to ${email}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Code'}
              </Button>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Or</span>
                </div>
              </div>
              <Button type="button" variant="outline" className="w-full" onClick={handleGoogleSignIn}>
                Sign in with Google
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-3">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Verifying...' : 'Verify Code'}
              </Button>
              <button
                type="button"
                onClick={handleResend}
                className="text-sm text-muted-foreground underline w-full text-center"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setError(null); setOtp('') }}
                className="text-sm text-muted-foreground underline w-full text-center"
              >
                Use a different email
              </button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Done when:** File exists. `/login` renders the email form. Submitting email transitions to OTP step without full page reload.

---

### F7 — Create Profile Form Component
**Depends on:** F1, B3
**File to create:** `src/components/profile/profile-form.tsx`

Client component as specified in SPEC.md §10. Key behaviors:
- Receives `initialProfile` and `userEmail` as props
- Local state mirrors all editable profile fields
- On save: username uniqueness check → update → toast
- Avatar upload: file input → Supabase Storage `avatars` bucket → store public URL
- Success toast via `useToast` from `@/components/ui/use-toast`
- Error toast on failure with `variant: 'destructive'`

Full implementation details per SPEC.md §10. The component must handle:
- `profile_complete = true` when both `display_name` and `username` are non-empty
- Avatar file path convention: `{userId}/avatar.{ext}` with `upsert: true`
- Public URL obtained via `supabase.storage.from('avatars').getPublicUrl(path)`

**Done when:** File exists without TypeScript errors. Mounts on the profile page.

---

### F8 — Create Profile Page (Server Component)
**Depends on:** F7, B3, B5
**File to create:** `src/app/profile/page.tsx`

Server component as specified in SPEC.md §10:
```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProfileForm } from '@/components/profile/profile-form'

export default async function ProfilePage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?next=/profile')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Your Profile</h1>
      <ProfileForm initialProfile={profile} userEmail={user.email ?? ''} />
    </div>
  )
}
```

**Done when:** File exists. The profile page renders for an authenticated user.

---

### F9 — Create Placeholder Pages
**Depends on:** F1
**Files to create** (minimal placeholders — full implementation in later phases):

`src/app/page.tsx` — Homepage:
```typescript
export default function HomePage() {
  return <div className="max-w-7xl mx-auto px-4 py-16"><h1 className="text-4xl font-bold">Omni Incubator</h1></div>
}
```

`src/app/library/page.tsx`:
```typescript
export default function LibraryPage() {
  return <div className="max-w-7xl mx-auto px-4 py-16"><h1 className="text-2xl font-bold">E-book Library</h1><p className="text-muted-foreground mt-2">Coming in Phase 2.</p></div>
}
```

`src/app/pricing/page.tsx`:
```typescript
export default function PricingPage() {
  return <div className="max-w-7xl mx-auto px-4 py-16"><h1 className="text-2xl font-bold">Pricing</h1><p className="text-muted-foreground mt-2">Coming in Phase 3.</p></div>
}
```

`src/app/marketplace/page.tsx`:
```typescript
export default function MarketplacePage() {
  return <div className="max-w-7xl mx-auto px-4 py-16"><h1 className="text-2xl font-bold">Marketplace</h1><p className="text-muted-foreground mt-2">Coming soon.</p></div>
}
```

`src/app/sweepstakes/page.tsx`:
```typescript
export default function SweepstakesPage() {
  return <div className="max-w-7xl mx-auto px-4 py-16"><h1 className="text-2xl font-bold">Sweepstakes</h1><p className="text-muted-foreground mt-2">Coming in Phase 4A.</p></div>
}
```

`src/app/privacy/page.tsx` and `src/app/terms/page.tsx`: same pattern with "Privacy Policy" and "Terms of Service" headings.

**Done when:** All placeholder pages exist and render without errors. Nav links do not 404.

---

## Execution Order

Backend tasks should be executed in this order:
1. B1 (project init) → B2 (Supabase deps) → B3 (clients) → B4 (migrations) → B5 (middleware) → B6 (callback) → B7 (env example) → B8 (storage docs) → B9 (Sentry)

Frontend tasks must be executed after B1:
- F1 (shadcn init) → F2 (403 page) → F3 (error boundary) → F4 (layout components) → F5 (root layout) → F6 (login) → F7 (profile form) → F8 (profile page) → F9 (placeholders)

B3 must complete before F4, F6, F7, F8 (all need Supabase client imports).
F4 must complete before F5 (layout imports navbar/footer).
F7 must complete before F8 (profile page imports ProfileForm).
B5 must complete before testing F8 (middleware redirects protect /profile).
