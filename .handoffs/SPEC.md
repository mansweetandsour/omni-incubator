# SPEC.md — Phase 1: Foundation
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 1 — Foundation

---

## 1. Overview

This specification covers the complete technical foundation for the Omni Incubator platform. No application code exists yet — this is a greenfield Next.js 14 project. All decisions below are final and binding on downstream agents.

---

## 2. Tech Stack (Confirmed)

| Layer | Technology | Version / Notes |
|---|---|---|
| Framework | Next.js 14 App Router | TypeScript, `src/` directory |
| Styling | Tailwind CSS | v3, configured via `tailwind.config.ts` |
| Component Library | shadcn/ui | Initialized with New York style, zinc base color |
| Database | Supabase Postgres | Migrations via Supabase CLI |
| Auth | Supabase Auth | Email OTP + Google OAuth |
| Supabase SSR | `@supabase/ssr` | v0.5.x — cookie-based session management |
| Error Monitoring | Sentry | `@sentry/nextjs`, graceful no-op when DSN absent |
| Linting | ESLint | Default Next.js config |

---

## 3. Directory Structure

All application source files live under `src/`. No `app/` or `pages/` at the project root.

```
omni-incubator/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # Root layout — nav, footer, providers
│   │   ├── page.tsx                      # Homepage shell (empty, Phase 6 content)
│   │   ├── globals.css                   # Tailwind directives + CSS variables
│   │   ├── error.tsx                     # Root error boundary (Sentry integration)
│   │   ├── not-found.tsx                 # 404 page
│   │   ├── 403/
│   │   │   └── page.tsx                  # 403 Forbidden page (admin access denied)
│   │   ├── login/
│   │   │   └── page.tsx                  # Email OTP + Google OAuth (client component)
│   │   ├── profile/
│   │   │   └── page.tsx                  # Profile view/edit (server + client)
│   │   ├── library/
│   │   │   └── page.tsx                  # Placeholder (Phase 2)
│   │   ├── pricing/
│   │   │   └── page.tsx                  # Placeholder (Phase 3)
│   │   ├── marketplace/
│   │   │   └── page.tsx                  # Placeholder (Phase 5)
│   │   ├── sweepstakes/
│   │   │   └── page.tsx                  # Placeholder (Phase 4A)
│   │   ├── privacy/
│   │   │   └── page.tsx                  # Placeholder (Phase 6)
│   │   ├── terms/
│   │   │   └── page.tsx                  # Placeholder (Phase 6)
│   │   └── api/
│   │       └── auth/
│   │           └── callback/
│   │               └── route.ts          # Google OAuth callback handler
│   ├── components/
│   │   ├── layout/
│   │   │   ├── navbar.tsx                # Top navigation bar (server component)
│   │   │   ├── navbar-auth.tsx           # Auth-conditional nav section (client component)
│   │   │   ├── mobile-nav.tsx            # Hamburger + Sheet slide-out (client component)
│   │   │   └── footer.tsx               # Site footer (server component)
│   │   ├── profile/
│   │   │   └── profile-form.tsx          # Profile edit form (client component)
│   │   └── ui/                           # shadcn/ui auto-generated components
│   ├── lib/
│   │   └── supabase/
│   │       ├── client.ts                 # Browser client
│   │       ├── server.ts                 # Server client
│   │       └── admin.ts                  # Service role client (never import in components)
│   └── middleware.ts                     # Session refresh + route protection
├── supabase/
│   ├── migrations/
│   │   ├── 20240101000001_enums.sql
│   │   ├── 20240101000002_profiles.sql
│   │   ├── 20240101000003_products_ebooks.sql
│   │   ├── 20240101000004_services.sql
│   │   ├── 20240101000005_orders_billing.sql
│   │   ├── 20240101000006_sweepstakes_core.sql
│   │   ├── 20240101000007_lead_captures_samples.sql
│   │   ├── 20240101000008_email_stripe_tables.sql
│   │   ├── 20240101000009_deferred_fks.sql
│   │   ├── 20240101000010_functions_triggers.sql
│   │   ├── 20240101000011_indexes.sql
│   │   ├── 20240101000012_materialized_views.sql
│   │   ├── 20240101000013_rls_policies.sql
│   │   └── 20240101000014_seed_data.sql
│   ├── storage.md                        # Bucket docs for operator
│   └── auth-config.md                   # Auth config notes for operator
├── sentry.client.config.ts
├── sentry.server.config.ts
├── sentry.edge.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .env.local.example
└── package.json
```

---

## 4. Supabase Client Modules

### 4.1 `src/lib/supabase/client.ts` — Browser Client

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

- Named export: `createClient` (function, not singleton — safe to call per render in client components)
- TypeScript: `Database` type import from `@/types/supabase` — use `any` placeholder until Phase 2 generates types

### 4.2 `src/lib/supabase/server.ts` — Server Client

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
            // setAll called from Server Component — cookies() is read-only
            // Session refresh handled by middleware
          }
        },
      },
    }
  )
}
```

- `async` function — `cookies()` is async in Next.js 14+
- Used in: Server Components, Server Actions, Route Handlers

### 4.3 `src/lib/supabase/admin.ts` — Service Role Client

```typescript
import { createClient } from '@supabase/supabase-js'

// WARNING: This client bypasses RLS. Never import in components or browser code.
// Use only in: webhook handlers, admin API routes, server-only operations.
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

- Singleton export (server-only module, never bundled client-side)

---

## 5. Database Migrations

### Migration File Plan (14 files, in dependency order)

**File 1: `20240101000001_enums.sql`**
Creates all ENUM types before any table references them:
```sql
CREATE TYPE product_type AS ENUM ('ebook', 'membership_monthly', 'membership_annual', 'service');
CREATE TYPE service_rate_type AS ENUM ('hourly', 'fixed', 'monthly', 'custom');
CREATE TYPE order_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE coupon_entry_type AS ENUM ('multiplier', 'fixed_bonus');
CREATE TYPE entry_source AS ENUM ('purchase', 'non_purchase_capture', 'admin_adjustment', 'coupon_bonus');
```

**File 2: `20240101000002_profiles.sql`**
```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  display_name TEXT,
  username TEXT UNIQUE,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  stripe_customer_id TEXT UNIQUE,
  profile_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

**File 3: `20240101000003_products_ebooks.sql`**
```sql
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  type product_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  price_cents INTEGER NOT NULL,
  member_price_cents INTEGER,
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  stripe_member_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  is_coming_soon BOOLEAN DEFAULT false,
  cover_image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  custom_entry_amount INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE public.ebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  page_count INTEGER,
  format TEXT DEFAULT 'pdf',
  preview_file_path TEXT,
  authors TEXT[] DEFAULT '{}',
  isbn TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  operator_dependency TEXT,
  scale_potential TEXT,
  cost_to_start TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**File 4: `20240101000004_services.sql`**
```sql
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  provider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  rate_type service_rate_type NOT NULL,
  rate_cents INTEGER,
  rate_label TEXT,
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending',
  is_coming_soon BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

**File 5: `20240101000005_orders_billing.sql`**
```sql
-- Note: orders.coupon_id FK is deferred (coupons table not yet created)
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL DEFAULT '',
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT,
  coupon_id UUID,  -- FK added in 20240101000009_deferred_fks.sql
  coupon_code TEXT,
  stripe_promotion_code TEXT,
  status order_status DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER DEFAULT 0,
  total_cents INTEGER NOT NULL,
  is_member_discount BOOLEAN DEFAULT false,
  is_subscription_renewal BOOLEAN DEFAULT false,
  entries_awarded_by_checkout BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_type product_type NOT NULL,
  product_title TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL,
  list_price_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  status TEXT NOT NULL,
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_subscriptions_active_user
  ON public.subscriptions(user_id)
  WHERE status IN ('trialing', 'active');

CREATE TABLE public.user_ebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ebook_id UUID NOT NULL REFERENCES public.ebooks(id),
  order_id UUID REFERENCES public.orders(id),
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**File 6: `20240101000006_sweepstakes_core.sql`**
```sql
CREATE TABLE public.sweepstakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  prize_amount_cents INTEGER,
  prize_description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft',
  winner_user_id UUID REFERENCES public.profiles(id),
  winner_drawn_at TIMESTAMPTZ,
  non_purchase_entry_amount INTEGER DEFAULT 1,
  official_rules_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_sweepstakes_single_active
  ON public.sweepstakes((true))
  WHERE status = 'active';

CREATE TABLE public.entry_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweepstake_id UUID NOT NULL REFERENCES public.sweepstakes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  multiplier NUMERIC(5,2) NOT NULL CHECK (multiplier > 0),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT multiplier_valid_range CHECK (end_at > start_at)
);

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT,
  entry_type coupon_entry_type NOT NULL,
  entry_value NUMERIC(10,2) NOT NULL,
  max_uses_global INTEGER,
  max_uses_per_user INTEGER DEFAULT 1,
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  sweepstake_id UUID REFERENCES public.sweepstakes(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.coupon_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  order_id UUID REFERENCES public.orders(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, user_id, order_id)
);

CREATE TABLE public.sweepstake_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweepstake_id UUID NOT NULL REFERENCES public.sweepstakes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  lead_capture_id UUID,  -- FK added in deferred_fks.sql
  source entry_source NOT NULL,
  order_id UUID REFERENCES public.orders(id),
  order_item_id UUID REFERENCES public.order_items(id),
  product_id UUID REFERENCES public.products(id),
  base_entries INTEGER NOT NULL,
  multiplier NUMERIC(5,2) DEFAULT 1.0,
  coupon_multiplier NUMERIC(5,2) DEFAULT 1.0,
  coupon_id UUID REFERENCES public.coupons(id),
  bonus_entries INTEGER DEFAULT 0,
  total_entries INTEGER NOT NULL,
  list_price_cents INTEGER DEFAULT 0,
  amount_cents INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_purchase_entry UNIQUE (order_item_id, sweepstake_id)
);
```

**File 7: `20240101000007_lead_captures_samples.sql`**
```sql
-- lead_captures.sample_product_id FK is deferred (sample_products not yet created)
CREATE TABLE public.lead_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  ip_address INET,
  user_id UUID REFERENCES public.profiles(id),
  source TEXT DEFAULT 'popup',
  sample_product_id UUID,  -- FK added in deferred_fks.sql
  sweepstake_id UUID REFERENCES public.sweepstakes(id),
  confirmation_token TEXT UNIQUE,
  confirmation_sent_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  entry_awarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_email_per_sweep UNIQUE (email, sweepstake_id),
  CONSTRAINT contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE public.sample_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  cover_image_url TEXT,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  require_email BOOLEAN DEFAULT true,
  require_phone BOOLEAN DEFAULT false,
  upsell_product_id UUID REFERENCES public.products(id),
  upsell_membership BOOLEAN DEFAULT true,
  upsell_heading TEXT,
  upsell_body TEXT,
  custom_entry_amount INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**File 8: `20240101000008_email_stripe_tables.sql`**
```sql
CREATE TABLE public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  to_email TEXT NOT NULL,
  template TEXT NOT NULL,
  subject TEXT NOT NULL,
  resend_id TEXT,
  status TEXT DEFAULT 'sent',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);
```

**File 9: `20240101000009_deferred_fks.sql`**
Adds the three circular/deferred foreign key constraints after all tables exist:
```sql
ALTER TABLE public.orders
  ADD CONSTRAINT fk_orders_coupon
  FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);

ALTER TABLE public.sweepstake_entries
  ADD CONSTRAINT fk_entries_lead_capture
  FOREIGN KEY (lead_capture_id) REFERENCES public.lead_captures(id);

ALTER TABLE public.lead_captures
  ADD CONSTRAINT fk_lead_captures_sample_product
  FOREIGN KEY (sample_product_id) REFERENCES public.sample_products(id);
```

**File 10: `20240101000010_functions_triggers.sql`**
All functions and triggers. Created AFTER all tables (including `lead_captures`) exist — resolves WARN-4.

```sql
-- ============================================================
-- set_updated_at: applied to all tables with updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      tbl
    );
  END LOOP;
END;
$$;

-- ============================================================
-- compute_member_price: BEFORE INSERT OR UPDATE OF price_cents
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_member_price()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'ebook' THEN
    NEW.member_price_cents := FLOOR(NEW.price_cents * 0.5);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_member_price
  BEFORE INSERT OR UPDATE OF price_cents ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.compute_member_price();

-- ============================================================
-- generate_order_number: BEFORE INSERT on orders
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  suffix TEXT;
BEGIN
  suffix := UPPER(SUBSTRING(MD5(gen_random_uuid()::text), 1, 8));
  NEW.order_number := 'OMNI-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || suffix;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION public.generate_order_number();

-- ============================================================
-- handle_new_user: AFTER INSERT on auth.users
-- Created last — references lead_captures which now exists
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    LOWER(REGEXP_REPLACE(
      COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
      '[^a-zA-Z0-9]', '', 'g'
    )) || '-' || SUBSTRING(gen_random_uuid()::text, 1, 4)
  );

  -- Link any pre-existing lead captures by email
  UPDATE public.lead_captures
  SET user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email) AND user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**File 11: `20240101000011_indexes.sql`**
```sql
-- Products
CREATE INDEX idx_products_type ON public.products(type) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_slug ON public.products(slug);
CREATE INDEX idx_products_active ON public.products(is_active, type) WHERE deleted_at IS NULL;

-- E-books
CREATE INDEX idx_ebooks_category ON public.ebooks(category);
CREATE INDEX idx_ebooks_product ON public.ebooks(product_id);

-- Orders
CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_number ON public.orders(order_number);
CREATE INDEX idx_orders_stripe_session ON public.orders(stripe_checkout_session_id);
CREATE INDEX idx_orders_stripe_invoice ON public.orders(stripe_invoice_id);
CREATE INDEX idx_orders_created ON public.orders(created_at);

-- Subscriptions
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id);

-- Sweepstake entries
CREATE INDEX idx_entries_user_sweep ON public.sweepstake_entries(user_id, sweepstake_id);
CREATE INDEX idx_entries_order ON public.sweepstake_entries(order_id);
CREATE INDEX idx_entries_sweep_source ON public.sweepstake_entries(sweepstake_id, source);

-- Lead captures
CREATE INDEX idx_lead_captures_email ON public.lead_captures(email);
CREATE INDEX idx_lead_captures_phone ON public.lead_captures(phone);
CREATE INDEX idx_lead_captures_token ON public.lead_captures(confirmation_token);
CREATE INDEX idx_lead_captures_unconfirmed ON public.lead_captures(confirmation_sent_at)
  WHERE confirmed_at IS NULL AND entry_awarded = false;

-- Sample products
CREATE INDEX idx_sample_products_slug ON public.sample_products(slug);
CREATE INDEX idx_sample_products_active ON public.sample_products(is_active);

-- Coupons
CREATE INDEX idx_coupons_code ON public.coupons(UPPER(code));

-- Entry multipliers
CREATE INDEX idx_multipliers_sweep_time ON public.entry_multipliers(sweepstake_id, start_at, end_at)
  WHERE is_active = true;
```

**File 12: `20240101000012_materialized_views.sql`**
```sql
CREATE MATERIALIZED VIEW public.entry_verification AS
WITH order_totals AS (
  SELECT
    o.user_id,
    sw.id AS sweepstake_id,
    COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0) AS actual_order_total
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  JOIN public.sweepstakes sw ON o.created_at BETWEEN sw.start_at AND sw.end_at
  WHERE o.status = 'completed'
  GROUP BY o.user_id, sw.id
)
SELECT
  se.user_id,
  se.sweepstake_id,
  SUM(se.total_entries) AS total_entries,
  SUM(se.total_entries) FILTER (WHERE se.source = 'purchase') AS purchase_entries,
  SUM(se.total_entries) FILTER (WHERE se.source = 'non_purchase_capture') AS non_purchase_entries,
  SUM(se.total_entries) FILTER (WHERE se.source = 'admin_adjustment') AS admin_entries,
  SUM(se.total_entries) FILTER (WHERE se.source = 'coupon_bonus') AS coupon_bonus_entries,
  SUM(se.list_price_cents) FILTER (WHERE se.source = 'purchase') AS entries_list_price_basis,
  SUM(se.amount_cents) FILTER (WHERE se.source = 'purchase') AS entries_amount_collected,
  COALESCE(ot.actual_order_total, 0) AS actual_order_total
FROM public.sweepstake_entries se
LEFT JOIN order_totals ot ON ot.user_id = se.user_id AND ot.sweepstake_id = se.sweepstake_id
GROUP BY se.user_id, se.sweepstake_id, ot.actual_order_total;

CREATE UNIQUE INDEX idx_entry_verification_pk
  ON public.entry_verification(user_id, sweepstake_id);
```

**File 13: `20240101000013_rls_policies.sql`**

Full RLS implementation. See Section 6 below for the complete SQL.

**File 14: `20240101000014_seed_data.sql`**
```sql
INSERT INTO public.products (slug, type, title, description, price_cents, is_active) VALUES
  (
    'omni-membership-monthly',
    'membership_monthly',
    'Omni Membership — Monthly',
    'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace.',
    1500,
    true
  ),
  (
    'omni-membership-annual',
    'membership_annual',
    'Omni Membership — Annual',
    'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace. Save $51/year vs monthly.',
    12900,
    true
  );
```

---

## 6. RLS Policies (Complete SQL for Migration File 13)

**Design decisions:**
- Admin check pattern: `(SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'` (correlated subquery, safe)
- `processed_stripe_events`: RLS enabled, zero permissive policies — only service role client (bypasses RLS) can access (resolves WARN-2)
- Profiles UPDATE policy uses `WITH CHECK` to prevent role column self-escalation

```sql
-- ============================================================
-- PROFILES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_admin_select"
  ON public.profiles FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "profiles_admin_update"
  ON public.profiles FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- PRODUCTS
-- ============================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_public"
  ON public.products FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

CREATE POLICY "products_admin_all"
  ON public.products FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- EBOOKS
-- ============================================================
ALTER TABLE public.ebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ebooks_select_public"
  ON public.ebooks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = ebooks.product_id
        AND p.is_active = true
        AND p.deleted_at IS NULL
    )
  );

CREATE POLICY "ebooks_admin_all"
  ON public.ebooks FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SERVICES
-- ============================================================
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select_public"
  ON public.services FOR SELECT
  USING (status IN ('active', 'approved') OR is_coming_soon = true);

CREATE POLICY "services_admin_all"
  ON public.services FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SAMPLE_PRODUCTS
-- ============================================================
ALTER TABLE public.sample_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sample_products_select_public"
  ON public.sample_products FOR SELECT
  USING (is_active = true);

CREATE POLICY "sample_products_admin_all"
  ON public.sample_products FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- ORDERS
-- ============================================================
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "orders_admin_all"
  ON public.orders FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- ORDER_ITEMS
-- ============================================================
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_items_select_own"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "order_items_admin_all"
  ON public.order_items FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscriptions_admin_all"
  ON public.subscriptions FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- USER_EBOOKS
-- ============================================================
ALTER TABLE public.user_ebooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_ebooks_select_own"
  ON public.user_ebooks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "user_ebooks_admin_all"
  ON public.user_ebooks FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SWEEPSTAKES
-- ============================================================
ALTER TABLE public.sweepstakes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sweepstakes_select_public"
  ON public.sweepstakes FOR SELECT
  USING (status IN ('active', 'ended', 'drawn'));

CREATE POLICY "sweepstakes_admin_all"
  ON public.sweepstakes FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- SWEEPSTAKE_ENTRIES
-- ============================================================
ALTER TABLE public.sweepstake_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sweepstake_entries_select_own"
  ON public.sweepstake_entries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "sweepstake_entries_admin_all"
  ON public.sweepstake_entries FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- ENTRY_MULTIPLIERS
-- ============================================================
ALTER TABLE public.entry_multipliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entry_multipliers_select_public"
  ON public.entry_multipliers FOR SELECT
  USING (is_active = true);

CREATE POLICY "entry_multipliers_admin_all"
  ON public.entry_multipliers FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- LEAD_CAPTURES — admin only (no public or user access)
-- ============================================================
ALTER TABLE public.lead_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_captures_admin_all"
  ON public.lead_captures FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- COUPONS — admin only (validated server-side via service role)
-- ============================================================
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupons_admin_all"
  ON public.coupons FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- COUPON_USES — admin only
-- ============================================================
ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coupon_uses_admin_all"
  ON public.coupon_uses FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- EMAIL_LOG — admin only
-- ============================================================
ALTER TABLE public.email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_log_admin_all"
  ON public.email_log FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- ============================================================
-- PROCESSED_STRIPE_EVENTS — no policies (service role only)
-- WARN-2 resolution: RLS enabled, zero permissive policies.
-- Only the adminClient (service_role key, bypasses RLS) can access.
-- ============================================================
ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;
-- No CREATE POLICY statements — intentionally locked down.
```

---

## 7. Auth Middleware (`src/middleware.ts`)

**Pattern:** Use `@supabase/ssr` `createServerClient` with cookie read/write. Session refresh happens on every request via the middleware. Do not import `server.ts` here — create a new client inline to avoid the `cookies()` read-only limitation.

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — MUST be called before any response is returned
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected: /profile/* — require auth
  if (pathname.startsWith('/profile')) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Protected: /admin/* — require auth + admin role
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/login'
      redirectUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(redirectUrl)
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      const forbiddenUrl = request.nextUrl.clone()
      forbiddenUrl.pathname = '/403'
      return NextResponse.redirect(forbiddenUrl)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

---

## 8. Google OAuth Callback (`src/app/api/auth/callback/route.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/library'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Validate next param is safe (starts with /)
      const redirectTo = next.startsWith('/') ? next : '/library'
      return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
}
```

---

## 9. Login Page (`src/app/login/page.tsx`)

**Component type:** Client Component (`'use client'`)

**State machine:**
- Step `email`: email input + Submit button + "Sign in with Google" button
- Step `otp`: 6-digit code input + Verify button + Resend link

**Key behaviors:**
- Email submit: calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`, transitions to `otp` step on success
- OTP verify: calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`, on success reads `next` param from URL (validated: must start with `/`) and redirects with `router.push`
- Resend: calls `signInWithOtp` again with the same email
- Google OAuth: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/api/auth/callback` } })`
- Error states: inline below input, not toast
- No full page reload between steps — pure React state

---

## 10. Profile Page

**`src/app/profile/page.tsx`** — Server Component:
- Uses `createClient()` from `src/lib/supabase/server.ts`
- Calls `supabase.auth.getUser()` to get email (read-only auth field)
- Calls `supabase.from('profiles').select('*').eq('id', user.id).single()` for profile data
- If no session (shouldn't happen — middleware guards this), redirect to `/login`
- Renders `<ProfileForm>` client component with initial profile data + user email as props

**`src/components/profile/profile-form.tsx`** — Client Component:
- Props: `initialProfile: Profile`, `userEmail: string`
- Local state: all editable fields (display_name, username, bio, phone, website, avatar_url)
- On save:
  1. Username uniqueness check: `supabase.from('profiles').select('id').eq('username', newUsername).neq('id', currentUserId).maybeSingle()` — if row returned, show inline error "Username already taken"
  2. `supabase.from('profiles').update({ ...fields, profile_complete: displayName !== '' && username !== '' }).eq('id', userId)`
  3. Success: `toast({ title: 'Profile saved' })`, failure: `toast({ title: 'Error', description: error.message, variant: 'destructive' })`
- Avatar upload:
  1. User selects file via `<input type="file" accept="image/*">`
  2. `supabase.storage.from('avatars').upload(`${userId}/avatar.${ext}`, file, { upsert: true })`
  3. `supabase.storage.from('avatars').getPublicUrl(path)` → store URL in `avatar_url` state
  4. Avatar URL is saved with the rest of the profile on Save

---

## 11. Root Layout (`src/app/layout.tsx`)

**Component type:** Server Component (async)

**Structure:**
```tsx
<html>
  <head>
    <script async src="https://r.wdfl.co/rw.js"
      data-rewardful={process.env.NEXT_PUBLIC_REWARDFUL_API_KEY} />
  </head>
  <body>
    <div id="multiplier-banner-slot" />  {/* Phase 4A */}
    <Navbar />                            {/* Server component, reads session */}
    <main>{children}</main>
    <Footer />                            {/* Server component */}
    <Toaster />                           {/* shadcn/ui Toaster — client */}
  </body>
</html>
```

**Navbar:**
- Server component: reads session via `createClient()` from server.ts
- Left: Logo ("Omni Incubator") → `/`
- Center: nav links (Library, Pricing, Marketplace, Sweepstakes)
- Right: `<NavbarAuth />` — client component that receives `user` prop (passed from server)

**NavbarAuth (client component):**
- When user = null: "Sign In" button → `/login`
- When user exists: avatar image (or initials fallback) + username → `<DropdownMenu>` with: Profile, My E-books, Orders, Entries, Subscription, Sign Out
- Sign Out calls `supabase.auth.signOut()` then `router.refresh()`

**MobileNav (client component):**
- Hamburger button (visible at `md:hidden`)
- Opens `<Sheet>` from right with same nav links + auth state
- Uses `useState` for open/close

**Footer:**
- Privacy, Terms, Sweepstakes Rules links
- Copyright: `© {new Date().getFullYear()} Omni Incubator`

---

## 12. Sentry Configuration

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

**`sentry.server.config.ts`** and **`sentry.edge.config.ts`:** Same pattern — wrap init in `if (dsn)` check.

**`next.config.ts`:**
```typescript
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig = { /* ... */ };

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

**`src/app/error.tsx`:** Global error boundary using `"use client"`. Calls `Sentry.captureException(error)` in `useEffect`.

---

## 13. shadcn/ui Setup

**Initialization:**
```bash
npx shadcn@latest init
```
- Style: New York
- Base color: zinc
- CSS variables: yes
- `components.json` at project root

**Components to install (10 required):**
```bash
npx shadcn@latest add button card input dialog dropdown-menu badge toast tabs table sheet skeleton
```

All components install to `src/components/ui/`. Import paths: `@/components/ui/button`, etc.

**`Toaster` component note:** shadcn/ui Toast system exports a `Toaster` component from `@/components/ui/toaster` (for the `toast` variant) or `@/components/ui/sonner` if using Sonner. Decision: use the built-in `toast` (not Sonner) to avoid adding another dependency. `<Toaster />` goes in root layout.

---

## 14. Environment Variables

**`.env.local.example`** at project root. All 18 variables per §14 of blueprint + PRD-REPORT WARN-1 correction.

---

## 15. Storage Bucket Documentation (`supabase/storage.md`)

Documents 5 buckets:
- `ebooks` — private, signed URLs (1hr)
- `ebook-previews` — public
- `sample-products` — private, signed URLs (1hr)
- `avatars` — public
- `covers` — public

CORS: allow `https://omniincubator.org` and `http://localhost:3000`. No file size limits specified beyond Supabase defaults; admin portal will handle large PDF uploads.

---

## 16. Third-Party Dependencies to Install

```bash
# Core
npm create next-app@latest omni-incubator --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# Supabase
npm install @supabase/ssr @supabase/supabase-js

# Sentry
npm install @sentry/nextjs

# shadcn/ui peer dependencies (installed via shadcn init)
# clsx, tailwind-merge, class-variance-authority, lucide-react, radix-ui packages
```

---

## 17. Non-Functional Requirements

- **Session refresh:** Handled by middleware on every request. No extra client-side refresh logic needed.
- **Error handling:** All Supabase calls in server components must handle the `{ data, error }` destructure pattern. Errors propagate to `error.tsx`.
- **Rate limiting:** Not in scope for Phase 1 (lead capture is Phase 4A).
- **TypeScript:** `strict: true` in `tsconfig.json`. Use `any` as a type placeholder for Supabase database types until Phase 2 generates them.
- **Environment variables:** App must gracefully handle missing env vars at dev time. Supabase clients will throw at runtime but not at build time.
- **No server actions** used in Phase 1 — all mutations go through client-side Supabase calls or Route Handlers for simplicity.
