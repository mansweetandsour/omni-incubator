# OMNI INCUBATOR — Master Build Plan v2.0 (Fortified)

**Domain:** omniincubator.org
**Build mode:** Solo Claude Code — human intervention only when absolutely necessary
**Stack:** Next.js 14 (App Router) + TypeScript + Supabase (Auth, Postgres, Storage) + Stripe + Beehiiv + Tailwind + shadcn/ui + Resend (transactional email) + Upstash Redis (rate limiting) + Rewardful (affiliate tracking)
**Migrations:** Supabase CLI (`supabase/migrations/` directory, sequential timestamped SQL files)
**Error monitoring:** Sentry (free tier)
**Deployment:** Vercel

---

## 1. PRODUCT ARCHITECTURE

### 1.1 Membership Model
- **Single tier:** Omni Membership
- **Pricing:** $15/month or $129/year
- **7-day free trial** before first charge
- **Cancellation:** `cancel_at_period_end = true` — access continues through end of billing period, then subscription transitions to `canceled`
- **Plan switching:** Monthly ↔ Annual allowed. Stripe handles proration automatically. On switch: update `subscriptions.product_id`, Stripe creates proration invoice.

### 1.2 Product Access Matrix

| Surface | Anonymous | Registered (no membership) | Active Member | Trialing Member |
|---------|-----------|---------------------------|---------------|-----------------|
| E-book Library (browse/preview) | ✅ | ✅ | ✅ | ✅ |
| E-book Purchase | Full price | Full price | **50% off** | **50% off** |
| E-book Download (owned) | ❌ | ✅ | ✅ | ✅ |
| Newsletter | ❌ | ❌ | ✅ | ✅ |
| Service Marketplace | "Coming Soon" | "Coming Soon" | "Coming Soon" | "Coming Soon" |
| Sweepstakes Entry Tracking | ❌ | ✅ (profile) | ✅ (profile) | ✅ (profile) |
| Profile / Order History | ❌ | ✅ | ✅ | ✅ |

**Key clarification:** Trialing members get member pricing (50% off e-books) immediately. The trial gates billing, not access. This is intentional — it makes the trial feel valuable and increases conversion.

**Member pricing logic:** A user gets member pricing if they have a subscription with `status IN ('trialing', 'active')`. Users with `past_due`, `unpaid`, or `canceled` status do NOT get member pricing.

### 1.3 Roles
- **user** — default, any registered person (may or may not have membership)
- **admin** — internal only, full platform control
- **Implementation:** `profiles.role TEXT DEFAULT 'user'` column. Admin check via `role = 'admin'`. RLS policies use `(SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'`. Initial admin seeded manually in DB.

### 1.4 Launch Scope

| Feature | Launch State |
|---------|-------------|
| E-book Library | ✅ Live |
| Newsletter (Beehiiv) | ✅ Live |
| Membership Billing | ✅ Live |
| Service Marketplace | ✅ Built, marked "Coming Soon" |
| Sweepstakes System | ✅ Live |
| Sample Product Funnel | ✅ Live |
| Admin Dashboard | ✅ Live |
| Sweepstakes Official Rules | ✅ Live |
| Privacy Policy | ✅ Live (static page) |
| Terms of Service | ✅ Live (static page) |

---

## 2. DATABASE SCHEMA

All tables use Supabase/Postgres. UUIDs as primary keys. `created_at` / `updated_at` timestamps on everything. Soft-delete (`deleted_at`) on primary entities. All migrations in `supabase/migrations/` as timestamped SQL files.

### 2.1 Users & Auth

```sql
-- Supabase auth.users handles authentication (email OTP + Google OAuth)
-- This is our extended profile table

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  phone TEXT,
  display_name TEXT, -- auto-generated on signup
  username TEXT UNIQUE, -- auto-generated, user can change later
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  role TEXT NOT NULL DEFAULT 'user', -- 'user' | 'admin'
  stripe_customer_id TEXT UNIQUE, -- created on first checkout, reused thereafter
  profile_complete BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Trigger: auto-create profile on auth.users insert
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

-- Handle Google OAuth where email may already exist from OTP
-- Supabase handles this natively: if the email matches an existing auth.users row,
-- it links the identity. No custom logic needed. But the profile trigger only
-- fires on INSERT, not on identity linking, so existing profile is preserved.

-- Notification system removed — emails cover all user-facing events at launch.
-- Can add in-app notifications post-launch if needed.
```

### 2.2 Products & E-books

```sql
CREATE TYPE product_type AS ENUM ('ebook', 'membership_monthly', 'membership_annual', 'service');

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- auto-generated from title, append UUID fragment on conflict
  type product_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT, -- rich text / markdown for detail page
  price_cents INTEGER NOT NULL, -- full price in cents
  member_price_cents INTEGER, -- for ebooks: computed as floor(price_cents * 0.5) on insert/update via trigger
  stripe_product_id TEXT, -- linked Stripe Product object
  stripe_price_id TEXT, -- linked Stripe Price object (full price)
  stripe_member_price_id TEXT, -- member discount price in Stripe (ebooks only)
  is_active BOOLEAN DEFAULT true,
  is_coming_soon BOOLEAN DEFAULT false,
  cover_image_url TEXT,
  sort_order INTEGER DEFAULT 0, -- admin-controlled display ordering
  metadata JSONB DEFAULT '{}',
  -- Sweepstakes
  custom_entry_amount INTEGER, -- nullable: override global 1:$1 rule. NULL = use global
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Auto-compute member_price_cents for ebooks
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

-- Slug generation handled in application layer:
-- 1. slugify(title)
-- 2. Check uniqueness
-- 3. If conflict: append '-' + first 6 chars of UUID
-- 4. Insert

CREATE TABLE public.ebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL, -- Supabase Storage path (NOT a signed URL — sign on demand)
  file_size_bytes BIGINT,
  page_count INTEGER,
  format TEXT DEFAULT 'pdf', -- 'pdf' | 'epub'
  preview_file_path TEXT, -- separate preview file uploaded by admin (first chapter, etc.)
  authors TEXT[] DEFAULT '{}',
  isbn TEXT,
  -- Library taxonomy
  category TEXT NOT NULL, -- 'conceptual' | 'skill' | 'industry' | 'startup_guide'
  subcategory TEXT,
  -- Scale tags
  operator_dependency TEXT, -- 'physical_service' | 'hybrid' | 'digital_saas'
  scale_potential TEXT, -- 'low' | 'medium' | 'high'
  cost_to_start TEXT, -- 'under_5k' | '5k_to_50k' | 'over_50k'
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Schema note on `file_path` vs `file_url`:** v1 stored `file_url` as a signed URL — wrong. Signed URLs expire. Store the raw storage path (e.g., `ebooks/product-uuid/filename.pdf`) and generate signed URLs on demand via the download API route. Signed URLs expire after 1 hour.

### 2.3 Marketplace (Built, Coming Soon)

```sql
CREATE TYPE service_rate_type AS ENUM ('hourly', 'fixed', 'monthly', 'custom');

CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL, -- nullable until marketplace goes live and services get Stripe products
  provider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- nullable: admin-created services may not have a provider yet
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  rate_type service_rate_type NOT NULL,
  rate_cents INTEGER, -- nullable when rate_type = 'custom' (displayed as "Contact for pricing")
  rate_label TEXT, -- display override (e.g., "Starting at $500", "Contact us", "Inquire")
  category TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'pending', -- 'pending' | 'approved' | 'active' | 'suspended'
  is_coming_soon BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
```

### 2.4 Orders & Billing

```sql
CREATE TYPE order_status AS ENUM ('pending', 'completed', 'failed');

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL, -- human-readable: 'OMNI-YYYYMMDD-XXXXXXXX' (8 random hex chars — ~4 billion combos/day, collision-safe)
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  stripe_checkout_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT, -- for subscription invoices
  coupon_id UUID, -- entry bonus coupon applied (nullable) — FK added after coupons table created
  coupon_code TEXT, -- denormalized entry bonus coupon code for display (nullable)
  stripe_promotion_code TEXT, -- Stripe Promotion Code used for price discount (nullable, captured from webhook session.total_details)
  status order_status DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL, -- before discounts
  discount_cents INTEGER DEFAULT 0, -- coupon discount amount
  total_cents INTEGER NOT NULL, -- final charged amount
  is_member_discount BOOLEAN DEFAULT false, -- was member pricing applied
  is_subscription_renewal BOOLEAN DEFAULT false, -- true for recurring membership charges
  entries_awarded_by_checkout BOOLEAN DEFAULT false, -- true when checkout.session.completed already awarded e-book entries (prevents invoice.paid from double-counting on combined ebook+membership checkouts)
  notes TEXT, -- internal notes
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Order number generation function
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
  WHEN (NEW.order_number IS NULL)
  EXECUTE FUNCTION public.generate_order_number();

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  product_type product_type NOT NULL, -- denormalized for query convenience
  product_title TEXT NOT NULL, -- denormalized: snapshot at time of purchase
  quantity INTEGER DEFAULT 1,
  unit_price_cents INTEGER NOT NULL, -- actual price paid per unit
  list_price_cents INTEGER NOT NULL, -- original listed price (before member discount)
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id), -- monthly or annual membership product
  status TEXT NOT NULL, -- 'trialing' | 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete'
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ, -- when cancellation was initiated (not when access ends)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint: only one active/trialing subscription per user
-- (prevents double subscriptions from race conditions)
CREATE UNIQUE INDEX idx_subscriptions_active_user
  ON public.subscriptions(user_id)
  WHERE status IN ('trialing', 'active');

-- Track e-book purchases / downloads
CREATE TABLE public.user_ebooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ebook_id UUID NOT NULL REFERENCES public.ebooks(id),
  order_id UUID REFERENCES public.orders(id), -- nullable for admin-granted access
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
  -- NO unique constraint on (user_id, ebook_id): duplicate purchases are allowed.
  -- Each purchase = separate order = separate sweepstake entries.
  -- Entries must match dollars collected, so blocking a second purchase would
  -- mean blocking legitimate entry-earning spend.
);
```

**Duplicate purchase policy:**
- **E-books:** Duplicate purchases are ALLOWED. Each purchase creates a new `user_ebooks` row, a new order, and awards entries based on the full list price. The user sees all copies in "My E-books" (though the download is the same file). The UI should NOT block re-purchase — if a user wants to buy an e-book they already own to earn entries, that's valid behavior. The detail page shows "Buy" regardless of ownership. If they already own it, a small note like "You already own this e-book" is fine, but the buy button remains active.
- **Membership:** Duplicate subscriptions ARE blocked. Only one active/trialing subscription per user (enforced by unique partial index).
- **Non-purchase lead capture:** Duplicate entries per sweepstake ARE blocked (enforced by unique constraint on email + sweepstake_id).

### 2.5 Sweepstakes System

```sql
CREATE TABLE public.sweepstakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  prize_amount_cents INTEGER, -- cash prize
  prize_description TEXT, -- human-readable (e.g., "$5,000 to fund your business")
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'ended' | 'drawn'
  winner_user_id UUID REFERENCES public.profiles(id),
  winner_drawn_at TIMESTAMPTZ,
  non_purchase_entry_amount INTEGER DEFAULT 1, -- entries for email/phone capture
  official_rules_url TEXT, -- link to sweepstakes official rules page
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Constraint: only one active sweepstake at a time
CREATE UNIQUE INDEX idx_sweepstakes_single_active
  ON public.sweepstakes((true))
  WHERE status = 'active';

-- Global entry multiplier periods (e.g., "Double Entry Weekend")
CREATE TABLE public.entry_multipliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweepstake_id UUID NOT NULL REFERENCES public.sweepstakes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT, -- shown in site-wide banner
  multiplier NUMERIC(5,2) NOT NULL CHECK (multiplier > 0), -- e.g., 2.0 for double
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent overlapping multiplier periods within same sweepstake
  -- Enforced in application layer (DB exclusion constraint on tstzrange is more complex)
  CONSTRAINT multiplier_valid_range CHECK (end_at > start_at)
);

-- OVERLAP RULE: If multiple multipliers overlap, they DO NOT STACK.
-- The highest active multiplier at the time of purchase is applied.
-- Rationale: stacking creates unpredictable entry inflation and complicates the math.
-- Admin UI should warn on overlap but allow it.

CREATE TYPE coupon_entry_type AS ENUM ('multiplier', 'fixed_bonus');

-- Coupons are ENTRY BONUS ONLY. Price discounts are handled by Stripe Promotion Codes
-- (configured in Stripe Dashboard or via Stripe API). This keeps our coupon system
-- focused on the sweepstakes entry logic that Stripe can't handle natively.
CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL, -- stored uppercase, matched case-insensitive
  name TEXT, -- internal display name for admin
  entry_type coupon_entry_type NOT NULL,
  entry_value NUMERIC(10,2) NOT NULL, -- multiplier (e.g. 2.0) or fixed bonus count (e.g. 50)
  max_uses_global INTEGER, -- nullable = unlimited total uses
  max_uses_per_user INTEGER DEFAULT 1, -- default 1 use per user
  current_uses INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ, -- nullable = never expires
  sweepstake_id UUID REFERENCES public.sweepstakes(id), -- nullable = applies to whichever sweepstake is active
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
  UNIQUE(coupon_id, user_id, order_id) -- prevent double-application on same order
);

-- The core entries ledger — APPEND-ONLY (no updates, no deletes)
CREATE TYPE entry_source AS ENUM ('purchase', 'non_purchase_capture', 'admin_adjustment', 'coupon_bonus');

CREATE TABLE public.sweepstake_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sweepstake_id UUID NOT NULL REFERENCES public.sweepstakes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULLABLE: pre-account lead capture entries have no user yet
  lead_capture_id UUID, -- links orphaned entries to lead captures for account linking — FK deferred (lead_captures defined later)
  source entry_source NOT NULL,
  order_id UUID REFERENCES public.orders(id), -- nullable: only for purchase entries
  order_item_id UUID REFERENCES public.order_items(id), -- nullable: for per-product tracking
  product_id UUID REFERENCES public.products(id), -- nullable
  base_entries INTEGER NOT NULL, -- before multipliers (CAN be negative for admin deductions)
  multiplier NUMERIC(5,2) DEFAULT 1.0, -- snapshot: global multiplier at time of entry
  coupon_multiplier NUMERIC(5,2) DEFAULT 1.0, -- snapshot: coupon multiplier
  coupon_id UUID REFERENCES public.coupons(id), -- nullable
  bonus_entries INTEGER DEFAULT 0, -- fixed bonus from coupon
  total_entries INTEGER NOT NULL, -- final computed: floor(base * multiplier * coupon_multiplier) + bonus
  list_price_cents INTEGER DEFAULT 0, -- full list price entries are based on (pre-discount)
  amount_cents INTEGER DEFAULT 0, -- actual $ charged (may differ from list_price if member discount applied)
  notes TEXT, -- required for admin_adjustment source
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent double-awarding entries for the same order item
  CONSTRAINT unique_purchase_entry UNIQUE (order_item_id, sweepstake_id)
    -- only applies when order_item_id is not null; nulls don't conflict
);

-- Non-purchase captures (popup, landing page, sample product)
CREATE TABLE public.lead_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  ip_address INET, -- for basic abuse detection
  user_id UUID REFERENCES public.profiles(id), -- linked on account creation via trigger
  source TEXT DEFAULT 'popup', -- 'popup' | 'footer' | 'landing' | 'marketplace_coming_soon' | 'sample_product'
  sample_product_id UUID, -- nullable: set when source = 'sample_product' — FK added after sample_products table created
  sweepstake_id UUID REFERENCES public.sweepstakes(id),
  -- Email confirmation (required for entry validation)
  confirmation_token TEXT UNIQUE, -- random token sent in confirmation email
  confirmation_sent_at TIMESTAMPTZ, -- when confirmation email was sent
  confirmed_at TIMESTAMPTZ, -- when user clicked confirmation link
  entry_awarded BOOLEAN DEFAULT false, -- only true AFTER email confirmed
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Prevent same email from getting multiple non-purchase entries per sweepstake
  CONSTRAINT unique_email_per_sweep UNIQUE (email, sweepstake_id),
  -- At least one contact method required
  CONSTRAINT contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Sample products: free downloadable resources used as lead magnets
CREATE TABLE public.sample_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL, -- URL slug for landing page: /free/[slug]
  title TEXT NOT NULL, -- e.g., "10 Top Business Lessons Guide"
  description TEXT, -- short description for the landing page
  long_description TEXT, -- markdown: full sales copy for landing page
  cover_image_url TEXT,
  file_path TEXT NOT NULL, -- Supabase Storage path (private bucket: 'sample-products')
  file_size_bytes BIGINT,
  -- Configurable required fields for capture form
  require_email BOOLEAN DEFAULT true,
  require_phone BOOLEAN DEFAULT false,
  -- Upsell configuration
  upsell_product_id UUID REFERENCES public.products(id), -- primary upsell product (e.g., a related e-book)
  upsell_membership BOOLEAN DEFAULT true, -- show membership upsell CTA
  upsell_heading TEXT, -- e.g., "Ready for the full library?"
  upsell_body TEXT, -- e.g., "Get 50% off all e-books with Omni Membership"
  -- Entry tracking
  custom_entry_amount INTEGER, -- nullable: override sweepstake.non_purchase_entry_amount for this sample
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Deferred FK constraints (tables defined above, FKs couldn't be inline due to creation order)
ALTER TABLE public.orders ADD CONSTRAINT fk_orders_coupon FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);
ALTER TABLE public.sweepstake_entries ADD CONSTRAINT fk_entries_lead_capture FOREIGN KEY (lead_capture_id) REFERENCES public.lead_captures(id);
ALTER TABLE public.lead_captures ADD CONSTRAINT fk_lead_captures_sample_product FOREIGN KEY (sample_product_id) REFERENCES public.sample_products(id);

-- Auto-update updated_at on all tables that have it
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at columns
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

-- Materialized view for entry verification (better performance than regular view)
CREATE MATERIALIZED VIEW public.entry_verification AS
WITH order_totals AS (
  -- Pre-aggregate order totals per user per sweepstake period (avoids correlated subquery)
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

-- Refresh after entry changes (called from application layer after entry insert)
-- REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification;
-- Requires a unique index:
CREATE UNIQUE INDEX idx_entry_verification_pk
  ON public.entry_verification(user_id, sweepstake_id);
```

### 2.6 Email Log

```sql
-- Track all transactional emails for debugging and audit
CREATE TABLE public.email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id),
  to_email TEXT NOT NULL,
  template TEXT NOT NULL, -- 'lead_capture_confirm', 'sample_product_confirm', 'ebook_purchase', 'membership_welcome', 'membership_charged', 'trial_ending', 'payment_failed', 'entry_awarded'
  subject TEXT NOT NULL,
  resend_id TEXT, -- Resend message ID for tracking
  status TEXT DEFAULT 'sent', -- 'sent' | 'delivered' | 'bounced' | 'failed'
  metadata JSONB DEFAULT '{}', -- template variables, order info, etc.
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2.7 Indexes

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

### 2.8 Seed Data

```sql
-- Required seed data for launch (run after migrations)

-- Membership products (these must exist before any checkout can happen)
INSERT INTO public.products (slug, type, title, description, price_cents, is_active) VALUES
  ('omni-membership-monthly', 'membership_monthly', 'Omni Membership — Monthly', 'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace.', 1500, true),
  ('omni-membership-annual', 'membership_annual', 'Omni Membership — Annual', 'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace. Save $51/year vs monthly.', 12900, true);

-- EXTERNAL TASK: After creating Stripe Products and Prices for these, update:
--   stripe_product_id, stripe_price_id on both rows
```

---

## 3. AUTH FLOW

### 3.1 Methods
- **Primary:** Email-based OTP (Supabase Auth — configure provider to use OTP, not magic link)
- **Secondary:** Google OAuth (Supabase Auth — Google provider)
- **Supabase config:** Set `MAILER_OTP_EXP` to 600 (10 min), disable magic links, enable email OTP

### 3.2 Signup / Login Flow
1. User enters email → Supabase sends 6-digit OTP → user enters code → verified → signed in
2. OR clicks "Sign in with Google" → OAuth redirect → signed in
3. On first sign-in: DB trigger auto-creates profile (see `handle_new_user` trigger above)
4. No onboarding flow. User lands on the page they were on (via `redirectTo` param on auth call, or library if cold signup)

### 3.3 Google OAuth + Existing Email Collision
- Supabase handles identity linking natively: if a user signed up with OTP (email: user@gmail.com) and later signs in with Google (same email), Supabase links the Google identity to the existing user. No duplicate profile created.
- **Edge case:** If user signed up with Google first, then tries OTP with same email — Supabase also handles this via identity linking.

### 3.4 Account Creation Without Signup (Lead Capture + Email Confirmation)

**All non-purchase entry mechanisms require email confirmation before entries are awarded.** This applies to both the site-wide popup and the sample product landing page. This prevents spam entries and validates that the email is real.

**Flow (popup and sample product landing):**
1. User submits email (+ phone if required) → `POST /api/lead-capture`
2. Server creates `lead_captures` row with `confirmed_at = NULL`, `entry_awarded = false`
3. Server generates a `confirmation_token` (crypto.randomUUID) and stores it
4. Server sends confirmation email: "Confirm your entry" with link to `https://omniincubator.org/confirm/{token}`
   - For sample product captures: email also says "Your download will be unlocked after confirmation"
5. **Entries are NOT created yet.** User sees: "Check your email to confirm your entry!"
6. User clicks confirmation link → `/confirm/{token}` page loads → calls `POST /api/lead-capture/confirm` with `token`
7. Server validates token, sets `confirmed_at = NOW()`, `entry_awarded = true`
8. Server creates `sweepstake_entries` row (user_id NULL, lead_capture_id set, source = 'non_purchase_capture')
9. If sample product: redirect to `/free/{slug}/download?token={token}` — download now unlocked
10. If popup: `/confirm/{token}` page shows inline "You're in!" with entry count and upsell CTAs

**Confirmation token expiry:** 72 hours. After that, user must re-submit the form.

**Orphaned sweepstake_entries still handled the same way:**
- `sweepstake_entries.user_id` is nullable (defined as such in the CREATE TABLE — no ALTER needed)
- `sweepstake_entries.lead_capture_id` links to the lead capture (defined in the CREATE TABLE)
- When that email later creates an account, the `handle_new_user` trigger links `lead_captures.user_id`, then application code updates orphaned entries:

```sql
UPDATE sweepstake_entries
SET user_id = $new_user_id
WHERE lead_capture_id IN (
  SELECT id FROM lead_captures WHERE user_id = $new_user_id
) AND user_id IS NULL;
```

### 3.5 Session Configuration
- Supabase defaults: JWT expiry 1 hour, refresh token 1 week
- Acceptable for launch. No custom session config needed.

### 3.6 Rate Limiting
- Supabase Auth has built-in rate limiting on OTP sends (configurable in dashboard)
- Lead capture endpoint: rate limit 5 requests per IP per hour via **Upstash Rate Limit** (`@upstash/ratelimit` + `@upstash/redis`). In-memory rate limiting doesn't work on Vercel serverless (no shared state between invocations). Upstash free tier is sufficient for launch.

---

## 4. BILLING & CHECKOUT FLOWS

### 4.1 Stripe Customer Management
- On first checkout, check if `profiles.stripe_customer_id` exists
- If not: `stripe.customers.create({ email, metadata: { supabase_user_id } })`, store `stripe_customer_id` on profile
- All subsequent checkouts reuse the same Stripe customer

### 4.2 Membership Checkout
1. User clicks "Join" → API route `POST /api/checkout/membership`
2. Check: does user already have an active/trialing subscription? If yes → redirect to subscription management page with message
3. Create Stripe Checkout Session:
   ```
   mode: 'subscription'
   line_items: [{ price: STRIPE_MONTHLY_PRICE_ID or STRIPE_ANNUAL_PRICE_ID, quantity: 1 }]
   subscription_data: { trial_period_days: 7 }
   allow_promotion_codes: true  // Stripe handles price discount codes natively
   customer: stripe_customer_id
   success_url: /library?checkout=success
   cancel_url: /pricing?checkout=canceled
   ```
4. Redirect to Stripe Checkout
5. Webhooks handle the rest (see §4.7)

### 4.3 E-book Checkout (Non-Member)
1. User clicks "Buy" on e-book detail page → API route `POST /api/checkout/ebook`
2. **Pre-checks:**
   - Is user a member (trialing/active)? → Use `stripe_member_price_id`
   - Non-member → Use `stripe_price_id` (full price)
   - **No duplicate purchase block.** Users may buy the same e-book again (earns additional entries). If they already own it, show a small note "You already own this e-book" but keep the Buy button active.
3. **Coupon handling:** If entry bonus coupon code submitted (validated via `POST /api/coupons/validate`):
   - Store `coupon_id` in checkout session `metadata` — entry bonuses are applied post-payment in the webhook handler
   - **Price discounts are handled natively by Stripe Promotion Codes** — `allow_promotion_codes: true` on the checkout session lets users enter discount codes directly on the Stripe page
4. Create Stripe Checkout Session:
   ```
   mode: 'payment'
   line_items: [{ price: stripe_price_id or stripe_member_price_id, quantity: 1 }]
   allow_promotion_codes: true  // Stripe handles price discount codes natively
   customer: stripe_customer_id
   success_url: /ebooks/download/{ebook_id}?checkout=success
   cancel_url: /library/{slug}?checkout=canceled
   metadata: { ebook_id, coupon_id, coupon_code } // entry bonus coupon, passed through to webhook
   ```
5. Redirect to Stripe Checkout

### 4.4 Membership + E-book Upsell Checkout
1. User on e-book detail page → toggles "Join Omni Membership" (checkbox/toggle on the product page itself, not a separate pre-checkout page)
2. API route `POST /api/checkout/ebook-with-membership`
3. Create Stripe Checkout Session:
   ```
   mode: 'subscription'
   line_items: [
     { price: STRIPE_MONTHLY_PRICE_ID, quantity: 1 },  // subscription line item
     { price: stripe_member_price_id, quantity: 1, adjustable_quantity: { enabled: false } }  // one-time
   ]
   subscription_data: { trial_period_days: 7 }
   allow_promotion_codes: true
   ```
   **⚠️ Stripe limitation:** In `subscription` mode, one-time `line_items` are charged immediately even during trial. This is actually correct behavior for us — the e-book is paid for now, the membership trial starts. But important to know.
4. Post-checkout: Download page + email with download link

### 4.5 Existing Member Buys E-book
- Checkout flow auto-detects active subscription → applies member price
- No upsell banner shown (already a member)
- Standard e-book checkout at 50% off

### 4.6 Plan Switching (Monthly ↔ Annual)
- Handled entirely by **Stripe Customer Portal** — no custom API needed
- Portal is configured in Stripe Dashboard to allow switching between monthly and annual plans
- Stripe handles proration automatically
- Webhook `customer.subscription.updated` updates `subscriptions.product_id` in DB

### 4.7 Stripe Webhook Handler

**Endpoint:** `POST /api/webhooks/stripe` (public, verified via `stripe.webhooks.constructEvent`)

| Event | Handler Logic |
|-------|--------------|
| `checkout.session.completed` | 1. Look up order by `session.id`. 2. If `mode=payment`: set order `status=completed`, create `user_ebooks` row, send purchase confirmation email, award sweepstake entries for one-time purchase (§5). 3. If `mode=subscription` with one-time items: also create order/user_ebooks for the e-book line, award entries for the **e-book only** (subscription entries are handled by `invoice.paid`). **Store `entries_awarded_by_checkout = true` on the DB order row** — the `invoice.paid` handler checks this flag to avoid double-counting. |
| `customer.subscription.created` | Create `subscriptions` row. **Only send welcome email + Beehiiv subscribe if `status IN ('trialing', 'active')`** — skip if `status = 'incomplete'` (card declined). |
| `customer.subscription.updated` | Update subscription fields: `status`, `current_period_start/end`, `cancel_at_period_end`, `product_id`. |
| `customer.subscription.deleted` | Set subscription `status = 'canceled'`. Remove from Beehiiv via API (newsletter is a member-only benefit per §1.2 access matrix). |
| `invoice.paid` | 1. Check `amount_paid > 0` (skip $0 trial invoices). 2. Check this is NOT the initial invoice for a combined checkout (look up order by `stripe_checkout_session_id` from the invoice's subscription, check `entries_awarded_by_checkout` flag). 3. For subscription renewals: update subscription status to `active`, create order row with `is_subscription_renewal = true`, award sweepstake entries based on the **product's `price_cents`** (not the invoice amount — handles proration edge cases consistently). 4. **Skip proration-only invoices** (`invoice.billing_reason = 'subscription_update'` with no recurring line items): these are plan-switch adjustments, not renewals. 5. Send "membership charged" email with entry count. |
| `invoice.payment_failed` | Update subscription status to `past_due`. Send "payment failed" email to user. |
| `customer.subscription.trial_will_end` | Send "trial ending in 3 days" email. |

**Idempotency:** Use transactional idempotency — insert into `processed_stripe_events` AND perform all side effects within the same database transaction. If any step fails, the entire transaction rolls back (including the event ID), so Stripe's retry will succeed. See §13.1 for the full pattern.

```sql
CREATE TABLE public.processed_stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now()
);
```

**Trial invoice edge case:** Stripe fires `invoice.paid` for the $0 trial invoice too. The handler MUST check `invoice.amount_paid > 0` before awarding entries. A $0 invoice = trial start = no entries.

### 4.8 Newsletter Integration
- On `customer.subscription.created` webhook: call Beehiiv API `POST /publications/{pub_id}/subscriptions` with email
- On `customer.subscription.deleted`: remove from Beehiiv via API (newsletter is a members-only benefit per §1.2 access matrix)
- Newsletter is described as a membership benefit — auto opt-in is appropriate, auto removal on cancel is consistent

### 4.9 Affiliate Tracking (Rewardful)
- **How it works:** Rewardful JS snippet (loaded in root layout) drops a first-party cookie when a visitor arrives via `?via=affiliate_code`. All checkout API routes read this cookie and pass it as `clientReferenceId` on the Stripe Checkout Session. Rewardful connects directly to Stripe and auto-attributes conversions, renewals, and refunds — no custom webhook handling needed.
- **Implementation:** ~3 lines per checkout route:
  ```typescript
  const referralId = req.cookies.get('rewardful_referral')?.value;
  // Add to stripe.checkout.sessions.create():
  clientReferenceId: referralId || undefined,
  ```
- **Fraud protection (handled by Rewardful):** self-referral detection, cookie manipulation detection, duplicate conversion blocking, IP-based flagging, refund clawback (auto-reverses commission on Stripe refund), manual payout approval mode.
- **No schema changes needed.** Rewardful manages its own affiliate/referral data. Our DB doesn't need to know about affiliates.

### 4.10 Stripe Customer Portal
- Enable in Stripe Dashboard: allow cancellation, plan switching
- Link from subscription management page: `stripe.billingPortal.sessions.create({ customer, return_url })`
- Portal handles cancellation UI — sets `cancel_at_period_end = true`

---

## 5. SWEEPSTAKES ENGINE

### 5.1 Entry Calculation Logic (Detailed)

```typescript
function calculateEntries(params: {
  product: Product,
  listPriceCents: number,   // ALWAYS the full list price (pre-discount)
  pricePaidCents: number,   // actual amount charged (for audit trail only)
  sweepstakeId: string,
  couponId?: string,
}): EntryCalculation {

  // Step 1: Base entries — ALWAYS computed from FULL LIST PRICE, not price paid.
  // Members paying 50% off still earn entries as if they paid full price.
  // This is intentional: the discount is a membership benefit, entries are
  // based on the product's value, not the amount collected.
  // However, amount_cents on the entry record stores pricePaidCents for
  // audit verification against actual dollars collected.
  let baseEntries: number;
  if (product.custom_entry_amount !== null) {
    baseEntries = product.custom_entry_amount;
  } else {
    baseEntries = Math.floor(listPriceCents / 100); // 1 entry per dollar of LIST PRICE
  }

  // Step 2: Global multiplier — find the HIGHEST active multiplier right now
  const activeMultipliers = await db.query(`
    SELECT MAX(multiplier) as max_multiplier
    FROM entry_multipliers
    WHERE sweepstake_id = $1
      AND is_active = true
      AND NOW() BETWEEN start_at AND end_at
  `, [sweepstakeId]);
  const globalMultiplier = activeMultipliers.max_multiplier ?? 1.0;

  // Step 3: Coupon effects
  let couponMultiplier = 1.0;
  let bonusEntries = 0;
  if (couponId) {
    const coupon = await db.query('SELECT * FROM coupons WHERE id = $1', [couponId]);
    if (coupon.entry_type === 'multiplier') {
      couponMultiplier = coupon.entry_value;
    } else if (coupon.entry_type === 'fixed_bonus') {
      bonusEntries = coupon.entry_value;
    }
  }

  // Step 4: Final calculation
  const totalEntries = Math.floor(baseEntries * globalMultiplier * couponMultiplier) + bonusEntries;

  return {
    baseEntries,
    multiplier: globalMultiplier,
    couponMultiplier,
    bonusEntries,
    totalEntries,
    listPriceCents,       // what entries are based on
    amountCents: pricePaidCents, // what was actually charged (for audit)
  };
}
```

### 5.2 Custom Entry Amount Clarification
When a product has `custom_entry_amount = 50`:
- A non-member buying at full price ($20 e-book) → 50 base entries (NOT 20)
- A member buying at 50% off ($10) → still 50 base entries (custom overrides dollar calculation entirely)
- With a 2X global multiplier → 100 entries
- With a coupon multiplier of 1.5 → floor(50 * 2.0 * 1.5) = 150 entries
- With a fixed_bonus coupon of 25 → floor(50 * 2.0 * 1.0) + 25 = 125 entries

When a product has NO custom_entry_amount (dollar-based):
- A $20 e-book at full price → 20 base entries
- A member buying at 50% off ($10 charged) → **still 20 base entries** (entries based on list price, not amount paid)
- The member discount is a membership perk — it does NOT reduce entry earning
- `amount_cents` on the entry record stores the actual $10 paid (for financial audit), but `base_entries` is computed from the $20 list price

### 5.2b Non-Purchase Entry Calculation
Non-purchase entries (lead capture via popup or sample product) use a **simpler calculation**:
- Base entries = `sample_product.custom_entry_amount` (if set) OR `sweepstake.non_purchase_entry_amount` (default: 1)
- **Global multipliers do NOT apply** to non-purchase entries. Multipliers are a purchase incentive only.
- **Coupons do NOT apply** to non-purchase entries (no coupon is involved in a free capture).
- The `sweepstake_entries` row for non-purchase entries stores `multiplier = 1.0`, `coupon_multiplier = 1.0`, `bonus_entries = 0`.
- `total_entries = base_entries` (no multiplier math).

This keeps the sweepstakes fair: free entries are a fixed, predictable amount. Only paying customers benefit from multiplier events.

### 5.3 Recurring Membership Entries
- Every `invoice.paid` for a subscription creates entries:
  - Monthly at $15 with no custom amount → 15 entries per month
  - Annual at $129 with no custom amount → 129 entries per year
  - If admin sets `custom_entry_amount = 100` on the monthly product → 100 entries per renewal
- These entries accumulate in the sweepstake period they fall within

### 5.4 No Active Sweepstake Edge Case
- If a purchase happens and no sweepstake has `status = 'active'` → entries are NOT created
- The entry creation code queries for the active sweepstake first. If none found, log a warning but do not fail the purchase
- Admin dashboard should show a warning banner when no sweepstake is active: "⚠️ No active sweepstake — purchases are not earning entries"

### 5.5 Sweepstake Period Transition
- When admin ends a sweepstake (sets `status = 'ended'`): no more entries can be created for it
- Admin creates and activates the next sweepstake — new entries go to the new one
- There should be no gap if possible, but if there is, §5.4 applies

### 5.6 Entry Verification
- The materialized view `entry_verification` provides per-user rollup
- Refresh triggered by application code after entry inserts (debounce: refresh at most once per minute)
- Admin can see per-user: total entries, breakdown by source, two financial columns:
  - `entries_list_price_basis` — the sum of list prices entries were computed from (may exceed collected revenue due to member discounts)
  - `entries_amount_collected` — the actual dollars charged (should match `actual_order_total`)
- "Verified" check: `entries_amount_collected <= actual_order_total` — confirms we haven't awarded entries for money we didn't collect
- Note: entries CAN exceed a 1:$1 ratio vs collected revenue because member discounts grant entries at full list price. This is by design.

### 5.7 Global Export
CSV columns: `user_email, display_name, total_entries, purchase_entries, non_purchase_entries, admin_entries, coupon_bonus_entries, list_price_basis_cents, amount_collected_cents, actual_order_total_cents`

### 5.8 Non-Purchase Entry Abuse Mitigation
- Unique constraint on `(email, sweepstake_id)` prevents same email from getting multiple entries
- IP address stored on `lead_captures` — admin can investigate patterns
- Rate limit on lead capture endpoint: 5/hour per IP
- Not bulletproof (disposable emails, VPNs) — but adequate for launch. Can add email validation service later.

---

## 6. USER-FACING FEATURES

### 6.1 Public Pages

| Page | Route | Description |
|------|-------|-------------|
| Homepage | `/` | Hero, value prop, current sweepstake prize, CTA to library + membership |
| E-book Library | `/library` | Grid view, filter sidebar, search, sort |
| E-book Detail | `/library/[slug]` | Preview, pricing, entry badge, buy/download CTA |
| Pricing | `/pricing` | Membership benefits, monthly vs annual comparison, CTA |
| Marketplace | `/marketplace` | "Coming Soon" page with email capture for waitlist |
| Sweepstakes | `/sweepstakes` | Current prize, countdown, how it works, official rules link |
| Official Rules | `/sweepstakes/rules` | Legal sweepstakes rules (static content) |
| Privacy Policy | `/privacy` | Static page |
| Terms of Service | `/terms` | Static page |
| Login | `/login` | Email OTP + Google OAuth |
| Sample Product Landing | `/free/[slug]` | Free resource landing page — capture form, upsell, entry callout |
| Sample Product Download | `/free/[slug]/download` | Post-confirmation download page — download CTA, upsell |
| Email Confirmation | `/confirm/[token]` | Confirms email, awards entry, redirects (sample) or shows success (popup) |

### 6.2 Authenticated Pages

| Page | Route | Description |
|------|-------|-------------|
| Profile | `/profile` | View/edit display name, username, bio, avatar, email, phone |
| Order History | `/profile/orders` | Paginated order list with line items |
| My E-books | `/profile/ebooks` | Purchased e-books with download buttons (deduplicated — show each unique e-book once with download, even if purchased multiple times) |
| Subscription | `/profile/subscription` | Current plan status + "Manage Subscription" button → Stripe Customer Portal |
| My Entries | `/profile/entries` | Current period entry count, breakdown chart, history list |

### 6.3 E-book Download Page
- Route: `/ebooks/download/[id]`
- Requires auth + ownership check
- Shows: e-book cover, title, "Download" button
- Download button hits `/api/ebooks/[id]/download` → generates signed URL (1 hour expiry) → redirects to download
- Increments `user_ebooks.download_count` and updates `last_downloaded_at`
- Also shown post-checkout as the success page

### 6.4 Entry Display on Products
- Every product card: `🎟️ Earn {X} entries` badge
- If multiplier active: `🔥 {M}X ENTRIES` accent badge replaces standard badge
- E-book detail page: show both full-price and member-price entry calculations
  - "Buy at $20 → Earn 20 entries"
  - "Member price $10 → Earn 20 entries" (entries always based on full list price, even at member discount)
  - If custom_entry_amount set: both prices show the same custom entry count
- Membership cards on pricing page: "Earn {X} entries every month/year with your membership"

### 6.5 Email/Phone Capture Popup
- Trigger: first visit, after 10 seconds OR 50% scroll (whichever first)
- Suppression: `localStorage` key `omni_popup_dismissed` with timestamp. Re-show after 30 days if dismissed without submitting.
- Suppression: `localStorage` key `omni_popup_submitted` — never show again once submitted
- Content: "🎟️ Enter for a chance to win ${prize_amount} — No purchase necessary"
- Fields: email (required), phone (optional)
- On submit: `POST /api/lead-capture` with `source: 'popup'`
- Success state: "📧 Check your email to confirm your entry!" (NOT "You're entered" — entry requires confirmation)
- Also show on marketplace "Coming Soon" page as an inline form (not popup) for waitlist + entries

### 6.6 Site-wide Multiplier Banner
- When an active multiplier exists for the current sweepstake: show a persistent banner at the top of every page
- "{multiplier.name} — {M}X entries on all purchases! Ends {end_at formatted}"
- Dismissable with X, but re-shows on next page load (it's promotional, not a notification)

### 6.7 Sample Product Landing Page

**Route:** `/free/[slug]`
**Purpose:** Dedicated marketing landing page for a free downloadable resource. Captures contact data, awards sweepstake entries on email confirmation, delivers the free resource, and upsells into the paid ecosystem.

**Page layout (top → bottom):**

1. **Hero section**
   - Sample product title (large)
   - Cover image (left) + description copy (right)
   - Sweepstake entry callout: "🎟️ Download free + earn {X} entries in our ${prize} sweepstake!"

2. **Capture form**
   - Fields: email (always required), phone (shown only if `sample_product.require_phone = true`)
   - CTA button: "Get Your Free Guide" or similar
   - Fine print: "We'll send a confirmation email. Your entry and download link activate after confirmation."
   - On submit: `POST /api/lead-capture` with `source: 'sample_product'`, `sample_product_id`
   - Success state: replace form with "📧 Check your email! Click the confirmation link to unlock your free download and earn your entries."

3. **Social proof / benefits** (optional section, content from `long_description`)

4. **Upsell section** (shown if `upsell_product_id` or `upsell_membership` is set)
   - If `upsell_product_id` set: "Want to go deeper?" → featured e-book card with price, member price, entry badge, buy CTA
   - If `upsell_membership` set: membership pitch block with "Join Omni Membership" CTA
   - Custom heading/body from `upsell_heading` / `upsell_body`

5. **Sweepstake info block** — current sweepstake prize, countdown, link to `/sweepstakes`

**Confirmation email for sample product captures includes:**
- "Confirm your email to unlock your free download"
- Confirmation link: `https://omniincubator.org/confirm/{token}?redirect=/free/{slug}/download`
- Sweepstake entry callout

**Post-confirmation download page:** `/free/[slug]/download`
- Route checks: `token` query param → look up `lead_captures` by token → verify `confirmed_at IS NOT NULL`
- Shows: sample product cover, title, "Download" button (generates signed URL from `sample-products` bucket, 1hr expiry)
- Below download: full upsell section (same as landing page section 4)
- Also shows entry confirmation: "🎟️ You earned {X} entries!"

**SEO:** Each sample product landing page gets unique meta tags, OG image (cover), and can be linked from paid ads, social media, email campaigns, etc.

### 6.8 Email Confirmation Page

**Route:** `/confirm/[token]`
**Purpose:** Handles email confirmation for ALL non-purchase entry sources (popup AND sample product).

**Flow:**
1. Page loads → calls `POST /api/lead-capture/confirm` with `token`
2. Server validates: token exists, not expired (72hr), not already confirmed
3. Server sets `confirmed_at`, `entry_awarded = true`, creates `sweepstake_entries` row
4. **If source = 'sample_product':** redirect to `/free/{slug}/download?token={token}`
5. **If source = 'popup' or other:** show inline confirmation page:
   - "✅ You're in! You earned {X} entries in the ${prize} sweepstake."
   - Upsell CTAs: "Browse our e-book library" + "Join Omni Membership"
   - If active multiplier: "{M}X entry bonus active on all purchases!"

**Error states:**
- Invalid/missing token → "This link is invalid or has expired. Submit your email again to get a new confirmation link." + link to homepage
- Already confirmed → "You've already confirmed this entry!" + show entry count + upsell CTAs
- No active sweepstake → confirm email but don't award entries, show "Confirmation received!" without entry messaging

---

## 7. ADMIN DASHBOARD

**Route prefix:** `/admin`
**Access:** Check `profiles.role = 'admin'` on every admin route (middleware). Non-admins get 403.

### 7.1 Admin Layout
- Sidebar navigation: Dashboard, Products, E-books, Sample Products, Services, Orders, Users, Sweepstakes, Coupons, Settings
- All admin pages are server-rendered with auth check

### 7.2 Dashboard (Home)
- Active members count
- Total revenue (current month)
- Active sweepstake: title, entries count, days remaining
- Recent orders (last 10)
- Warning banners: "No active sweepstake", "Multiplier period ending soon", etc.

### 7.3 Products Management
- List view: all products with type filter
- Create/edit e-book product: title, description, price, cover image upload, category/tags/scales, custom entry amount, active/coming soon toggle
- On e-book create: upload PDF to Supabase Storage bucket `ebooks` (private bucket), upload optional preview PDF to bucket `ebook-previews` (public bucket for preview downloads)
- Stripe sync: on product create, auto-create Stripe Product + 2 Prices (full + member). Store IDs.
- **EXTERNAL TASK decision:** Creating Stripe products can be done via Stripe API in the admin flow — no manual Stripe Dashboard work needed if API keys are configured.

### 7.4 Sample Product Management
- List: all sample products with active status
- Create/edit: title, slug, description, long_description (markdown), cover image upload, file upload (PDF to `sample-products` private bucket)
- **Capture config:** toggle `require_email` (always on), toggle `require_phone`
- **Upsell config:** select upsell_product_id (dropdown of active e-books), toggle upsell_membership, custom upsell_heading / upsell_body
- **Entry config:** optional custom_entry_amount (overrides sweepstake.non_purchase_entry_amount for this sample)
- Active/inactive toggle
- **Stats:** total captures, confirmation rate, conversion to paid (if they later buy upsell product)
- **Preview:** "View landing page" link to `/free/{slug}`

### 7.5 Sweepstakes Management
- List: all sweepstakes with status badges
- Create: title, description, prize amount, prize description, start/end dates, non-purchase entry amount
- Activate: button to set `status = 'active'` (checks no other sweepstake is active first)
- End: button to set `status = 'ended'`
- **Multipliers sub-tab:** list/create/edit/toggle multipliers for selected sweepstake. Warning on overlap.
- **Entry stats:** total entries, entries by source, top 10 users by entries
- **Export:** CSV download button

### 7.6 Coupon Management (Entry Bonuses Only)
- **Note:** Price discount coupons are managed in the Stripe Dashboard as Promotion Codes. This admin section only manages entry bonus coupons.
- List: all coupons with status, usage count, expiry
- Create: code (auto-uppercased), name, entry_type (multiplier or fixed_bonus), entry_value, max_uses_global, max_uses_per_user, expires_at, sweepstake assignment (optional)
- Edit: all fields except code (code is immutable after creation)
- Toggle active/inactive

### 7.7 User Management
- Search: by email, phone, name, username, order number
- User detail page: profile info, subscription status, orders list, e-books owned, entry breakdown
- **Entry adjustment:** form to add/remove entries with required notes field. Creates `sweepstake_entries` row with `source = 'admin_adjustment'`. Negative `base_entries` for deductions.

### 7.8 Order Management
- List: paginated, sortable by date, filterable by status
- Search by order number, user email
- Order detail: line items, payment status, coupon used, entries awarded

---

## 8. E-BOOK LIBRARY TAXONOMY

### Categories
1. **Conceptual Learning** — mental models, frameworks, entrepreneurial mindset
2. **Skill Learning** — marketing, finance, sales, ops, legal, technical skills
3. **Industry Guides** — vertical-specific knowledge (real estate, e-commerce, food service, SaaS, etc.)
4. **Startup 0→1 Guides** — full playbooks for launching a specific business type

### Scale Tags
- **Operator Dependency:** Physical/Service/Brick&Mortar | Hybrid | Digital/SaaS
- **Scale Potential:** Low | Medium | High
- **Cost to Start:** Under $5K | $5K–$50K | Over $50K

### Library UI Behavior
- **Filters:** Sidebar with checkboxes for category, operator dependency, scale potential, cost to start. Multi-select within each group (OR logic within group, AND logic between groups).
- **Sort:** Dropdown — Newest, Price (Low→High), Price (High→Low), Title (A→Z)
- **Search:** Full-text search on title + tags + description. Debounced input (300ms).
- **Pagination:** 12 items per page, load more button (not infinite scroll — better for SEO)
- **Card layout:** Cover image (aspect ratio 3:4), title, author(s), category badge, price (with member price in accent color), entry badge
- **Empty state:** "No e-books match your filters" with reset filters button

---

## 9. STRIPE CONFIGURATION

### Products in Stripe
1. **Omni Membership — Monthly** (recurring, $15/mo, trial_period_days: 7)
2. **Omni Membership — Annual** (recurring, $129/yr, trial_period_days: 7)
3. **{E-book Title}** — one Stripe Product per e-book, two Stripe Prices: `full_price` + `member_price`

### Price Discounts vs Entry Bonus Coupons
**Price discounts** are handled entirely by **Stripe Promotion Codes** — created in the Stripe Dashboard or via Stripe API. All checkout sessions set `allow_promotion_codes: true`, letting users enter discount codes on the Stripe Checkout page. No custom discount logic needed in our codebase.

**Entry bonus coupons** (our `coupons` table) are a separate system that only affects sweepstake entries. These are validated via `POST /api/coupons/validate` and their ID is passed in checkout `metadata` so the webhook handler can apply entry multipliers/bonuses post-payment.

This separation means:
- Stripe owns all pricing/discount logic (no sync bugs, no parallel coupon objects)
- We own all entry bonus logic (which Stripe has no concept of)
- **Entry bonus coupons apply to checkout sessions only, NOT to recurring subscription invoices.** A coupon used at initial checkout does not carry forward to renewals.

### Webhooks to Handle
| Event | Handler |
|-------|---------|
| `checkout.session.completed` | Create/complete order, fulfill e-book, award one-time purchase entries |
| `customer.subscription.created` | Create subscription row, Beehiiv subscribe, welcome email |
| `customer.subscription.updated` | Sync subscription fields |
| `customer.subscription.deleted` | Mark canceled |
| `customer.subscription.trial_will_end` | Send trial ending email (3 days before) |
| `invoice.paid` | If `amount_paid > 0`: activate subscription, create renewal order, award entries, send charged email |
| `invoice.payment_failed` | Set `past_due`, send payment_failed email |

### Webhook Security
- Verify signature with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
- Return 200 immediately after processing (Stripe retries on non-2xx)
- **Transactional idempotency** via `processed_stripe_events` table — event ID insert + all side effects in one DB transaction (see §13.1)

---

## 10. TRANSACTIONAL EMAILS (via Resend)

| Template | Trigger | Content |
|----------|---------|---------|
| `otp_code` | Auth (Supabase built-in) | 6-digit code |
| `lead_capture_confirm` | Lead capture form submit (popup) | "Confirm your entry" — confirmation link, sweepstake prize mention, 72hr expiry note |
| `sample_product_confirm` | Lead capture form submit (sample product) | "Confirm your email to unlock your free download" — confirmation link, sample product title/cover, entry count, 72hr expiry |
| `ebook_purchase` | `checkout.session.completed` (payment mode) | Order summary, stable download link (`/ebooks/download/{id}` — auth-gated, NOT a signed URL), entries awarded |
| `membership_welcome` | `customer.subscription.created` | What's included, trial end date, library link |
| `membership_charged` | `invoice.paid` (amount > 0) | Invoice amount, entries awarded, next billing date |
| `trial_ending` | `customer.subscription.trial_will_end` | "Your trial ends in 3 days", what happens next, cancel link |
| `payment_failed` | `invoice.payment_failed` | "Your payment failed — update your payment method to keep your membership active", link to Stripe Portal |
| `entry_awarded` | Entry creation (if > 0 entries) | "You earned X entries in {sweepstake_title}!" |

**Download link in e-book purchase email:** Use a stable URL like `https://omniincubator.org/ebooks/download/{ebook_id}`. This route requires auth — user clicks link, logs in if needed, then gets the download. Do NOT embed signed storage URLs in emails (they expire).

**Download link in sample product confirmation email:** Do NOT include a direct download link in the confirmation email. The confirmation link redirects to the download page after confirming — this ensures the download is gated behind confirmation, not just email receipt.

---

## 11. BUILD PHASES — Claude Code Execution Plan

### Phase 1: Foundation (Sprint 1)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 1.1 | Init Next.js 14 project | `npx create-next-app` with App Router, TypeScript, Tailwind, ESLint | Use `src/` directory structure |
| 1.2 | Install + configure shadcn/ui | `npx shadcn-ui@latest init`, add Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet components | Will be used everywhere |
| 1.3 | Supabase client setup | Create `lib/supabase/client.ts` (browser), `lib/supabase/server.ts` (server component), `lib/supabase/admin.ts` (service role for webhooks) | Three client variants |
| 1.4 | Database migrations | Write all migration SQL files in `supabase/migrations/`. Include ALL tables from §2, triggers, indexes, seed data. | Run order matters — FK dependencies |
| 1.5 | Supabase Storage buckets | Create `ebooks` (private), `ebook-previews` (public), `sample-products` (private), `avatars` (public), `covers` (public) | Configure CORS for omniincubator.org |
| 1.6 | Auth: Email OTP flow | Login page with email input → OTP input. Supabase `signInWithOtp()`. Verify with `verifyOtp()`. | Configure Supabase to use OTP not magic link |
| 1.7 | Auth: Google OAuth | "Sign in with Google" button. Supabase `signInWithOAuth({ provider: 'google' })`. Callback handler at `/api/auth/callback`. | **EXTERNAL TASK:** Create Google OAuth client ID in Google Cloud Console |
| 1.8 | Auth middleware | Next.js middleware that checks session on protected routes (`/profile/*`, `/admin/*`). Redirect to `/login` if not authenticated. Admin routes additionally check `role = 'admin'`. | Use `@supabase/ssr` for cookie-based auth |
| 1.9 | Profile auto-generation | Handled by DB trigger `handle_new_user`. Verify trigger works after first signup. | Test with both OTP and Google signup |
| 1.10 | Profile page (view + edit) | `/profile` route. Display all fields. Edit form with save. On save, check if all required fields filled → set `profile_complete = true`. | Username uniqueness check on edit |
| 1.11 | Layout shell | Root layout with nav bar (logo, Library, Pricing, Marketplace, Sweepstakes, auth state), footer (links, legal pages). Responsive mobile nav (hamburger). Add Rewardful JS snippet (`<script>` tag in root layout `<head>`) for affiliate cookie tracking. | Multiplier banner slot at top. Rewardful snippet loads async, no perf impact. |
| 1.12 | Sentry setup | Install `@sentry/nextjs`, configure error boundary, add to `next.config.js` | **EXTERNAL TASK:** Create Sentry project, get DSN |
| 1.13 | Environment variables | Create `.env.local.example` with all vars from §14. Document which are public vs server-only. | Critical for Claude Code to know what's needed |

**Phase 1 exit criteria:** User can sign up with email OTP or Google, see their auto-generated profile, and edit it.

### Phase 2: Products & Library (Sprint 2)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 2.1 | Admin layout | `/admin` with sidebar nav, auth check middleware, 403 for non-admins | Separate layout from public site |
| 2.2 | Admin product CRUD | Create/edit/delete e-book products. Form: title, description, long_description (markdown), price, cover image upload, category, subcategory, tags, operator_dependency, scale_potential, cost_to_start, custom_entry_amount, is_active toggle. | Slug auto-generated on create |
| 2.3 | E-book file upload | On product create/edit: upload PDF to `ebooks` bucket, optional preview PDF to `ebook-previews` bucket. Store paths in `ebooks` table. | Max file size: 100MB |
| 2.4 | Stripe product sync | On admin product create: auto-create Stripe Product + 2 Prices via API. On price update: create new Stripe Price (prices are immutable in Stripe), update `stripe_price_id`. **If Stripe keys not yet configured (E4 is Phase 3), build the sync logic but guard with `if (!STRIPE_SECRET_KEY) skip` — admin can create products locally first, Stripe sync runs when keys are set.** | Stripe keys optional at this phase — sync is idempotent and can run retroactively |
| 2.5 | Library page | `/library` with product grid, filter sidebar, search, sort, pagination. Server-side rendered with search params for filters. | Public page, no auth required |
| 2.6 | E-book detail page | `/library/[slug]` with cover, title, author, description, preview download button, price display (full + member). **Buy CTA placeholder** (wired to checkout in Phase 3). **Entry badge placeholder** (wired to EntryBadge component in Phase 4A task 4.13). | If user owns: show small "You own this" note but keep Buy button active |
| 2.7 | Preview download | Public endpoint: stream preview PDF from `ebook-previews` bucket. No auth needed. | Link on detail page |
| 2.8 | Admin services CRUD | Create/edit services with all fields from schema. All marked `is_coming_soon = true` at launch. | For marketplace prep |
| 2.9 | Marketplace page | `/marketplace` with "Coming Soon" hero, grid of service cards (if any exist, with "Coming Soon" badge). **Email capture form placeholder** — wired to lead capture API in Phase 4A (task 4.6). | Public page |

**Phase 2 exit criteria:** Admin can create e-book products with files and covers. Public library page shows products with filters/search. Preview downloads work.

### Phase 3: Billing (Sprint 3)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 3.1 | Stripe customer creation | `lib/stripe.ts` utility. `getOrCreateStripeCustomer(userId)` → checks profile, creates if needed, stores ID. | Called before any checkout |
| 3.2 | Member pricing middleware | Utility function `isActiveMember(userId)` that checks subscription status. Used in checkout and product display. | Status IN ('trialing', 'active') — must exist before checkout endpoints |
| 3.3 | Membership checkout | `POST /api/checkout/membership` → Stripe Checkout (subscription mode, trial). Pre-check: no existing active sub. Read Rewardful referral cookie → pass as `clientReferenceId` on Stripe session. Redirect. | Monthly vs annual from request body |
| 3.4 | E-book checkout | `POST /api/checkout/ebook` → Stripe Checkout (payment mode). Member price if applicable. Duplicate purchases allowed (entries earned). Read Rewardful referral cookie → pass as `clientReferenceId`. | No ownership block |
| 3.5 | Upsell checkout | `POST /api/checkout/ebook-with-membership` → Stripe Checkout (subscription mode + one-time line item). Read Rewardful referral cookie → pass as `clientReferenceId`. | Complex: see §4.4 notes on Stripe behavior |
| 3.6 | Coupon validation API | `POST /api/coupons/validate` → validates entry bonus coupon code, returns entry effect (multiplier or fixed bonus). **Price discounts are handled by Stripe Promotion Codes natively** — no custom discount validation needed. | Case-insensitive code matching |
| 3.7 | Processed events table | Migration for `processed_stripe_events` | Idempotency guard — must exist before webhook handler |
| 3.8 | Webhook handler | `POST /api/webhooks/stripe` — full implementation of all events from §9. Transactional idempotency per §13.1. | Most critical piece — test thoroughly |
| 3.9 | Order creation | On webhook: create order with order_number, line items, entry bonus coupon info. Populate `discount_cents` from `session.total_details.breakdown.discounts` (Stripe Promotion Code discounts). | Order number auto-generated by trigger |
| 3.10 | Order history page | `/profile/orders` — paginated list, click to expand line items. | Auth required |
| 3.11 | My E-books page | `/profile/ebooks` — grid of owned e-books with download buttons. | Download button hits download API |
| 3.12 | E-book download API | `GET /api/ebooks/[id]/download` — auth + ownership check → generate signed URL (1hr) → redirect. Increment download count. | Signed URL, not direct file serve |
| 3.13 | Download page | `/ebooks/download/[id]` — post-checkout success page and re-download page. Auth required. Shows e-book info + download button. | Also used as checkout success_url |
| 3.14 | Subscription management | `/profile/subscription` — shows current plan and status with a "Manage Subscription" button that opens Stripe Customer Portal. **All plan switching, cancellation, and payment method updates handled by Stripe Portal** — no custom UI needed. | Configure portal features in Stripe Dashboard |
| 3.15 | Stripe portal endpoint | `POST /api/subscription/portal` → creates Stripe billing portal session → redirect. | Single endpoint replaces custom switch/cancel UI |
| 3.16 | Beehiiv integration | On subscription created webhook: `POST` to Beehiiv API to subscribe email. On deleted: remove from Beehiiv. | **EXTERNAL TASK:** Get Beehiiv API key |
| 3.17 | Transactional emails | Setup Resend client. Create email templates (React Email or plain HTML). Send on: purchase, welcome, charged, trial ending, payment failed. | **EXTERNAL TASK:** Verify domain in Resend |
| 3.18 | Email log | Log all sent emails to `email_log` table. | For debugging delivery issues |

**Phase 3 exit criteria:** Full purchase and subscription flow works end-to-end. User can buy e-book, buy membership, buy e-book with membership upsell. Webhooks process correctly. Downloads work. Emails send.

### Phase 4A: Sweepstakes Core (Sprint 4)

**Pre-requisite:** Resend must be configured (E9/E18) before this phase — confirmation emails are core to lead capture. Move E9/E18 to Phase 3 blocking dependency.

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 4.1 | Entry calculation engine | `lib/sweepstakes.ts` — `calculateEntries()` function per §5.1. `awardPurchaseEntries()`, `awardLeadCaptureEntries()` per §5.2b, `awardAdminAdjustment()`. | Core business logic — unit test this |
| 4.2 | Entry awarding integration | Hook into webhook handler: on `checkout.session.completed` (one-time) and `invoice.paid` (subscription, amount > 0), call `awardPurchaseEntries()`. **Respect combined-checkout dedup flag** (see §4.7 webhook table). | Must find active sweepstake first |
| 4.3 | Lead capture API | `POST /api/lead-capture` — validate email/phone, check duplicate, find active sweepstake, create lead_captures row with confirmation_token, send confirmation email. Does NOT create entry yet. | Rate limit: 5/IP/hour |
| 4.4 | Email confirmation API | `POST /api/lead-capture/confirm` — validate token, check 72hr expiry, set confirmed_at, create sweepstake_entries row, return redirect URL based on source. | Idempotent: already-confirmed returns success |
| 4.5 | Confirmation email templates | Two Resend templates: `lead_capture_confirm` (popup) and `sample_product_confirm` (sample product). Both include confirmation link with token. | Sample product template includes cover image + product title |
| 4.6 | Lead capture popup | Client component: trigger on timer/scroll, form with email + phone, submit to API, success state shows "Check your email to confirm!", localStorage suppression. | Also inline form on marketplace page |
| 4.7 | Confirmation page | `/confirm/[token]` — calls confirm API on load. If sample_product: redirect to download page. If popup: show "You're in!" with entry count + upsell CTAs. Error states for invalid/expired/already-confirmed. | Public page, no auth required |
| 4.8 | Resend confirmation API | `POST /api/lead-capture/resend` — accepts email address in body, looks up pending lead capture, resends confirmation email. Rate limit 1 per 5 min per email. Uses email (not record ID) to prevent enumeration attacks. | Button shown on popup success state |
| 4.9 | Lead → account linking | In `handle_new_user` trigger: links lead_captures. Application-level code on signup: update orphaned sweepstake_entries with new user_id. | Test this flow end-to-end |
| 4.10 | Admin sweepstakes CRUD | `/admin/sweepstakes` — list, create, edit, activate, end. Validation: can't activate if another is active. | Status transitions: draft→active→ended→drawn |
| 4.11 | Admin multipliers | `/admin/sweepstakes/[id]/multipliers` — list, create, edit, toggle active. Overlap warning (non-blocking). | Scoped to selected sweepstake |
| 4.12 | Admin coupons | `/admin/coupons` — list, create, edit, toggle. Code auto-uppercased. Shows usage count vs max. | Global page, not scoped to sweepstake |
| 4.13 | Entry badges on products | Component: `EntryBadge` — takes product, shows computed entries. Checks for active multiplier and adjusts display. | Used on library cards and detail pages |
| 4.14 | Multiplier banner | Component: `MultiplierBanner` — queries active multiplier for current sweepstake. Shows at top of layout if active. | Auto-hides when multiplier period ends |
| 4.15 | Materialized view refresh | After entry inserts, call `REFRESH MATERIALIZED VIEW CONCURRENTLY entry_verification`. Debounce in application. | Use a simple flag/timestamp to debounce |

**Phase 4A exit criteria:** Entry engine works end-to-end. Purchase entries award on webhook. Lead capture entries award on confirmed email. Popup captures leads. Admin can manage sweepstakes, multipliers, coupons.

### Phase 4B: Sample Products & Admin Tools (Sprint 5)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 4B.1 | Sample product admin CRUD | `/admin/sample-products` — create/edit with file upload, capture config (require_email/phone), upsell config, custom entry amount, active toggle. Stats: captures, confirmation rate. | File upload to `sample-products` bucket |
| 4B.2 | Sample product landing page | `/free/[slug]` — hero with cover + description, capture form (fields based on sample config), upsell section, sweepstake callout. On form submit: confirmation email sent. | SEO: dynamic meta tags, OG image |
| 4B.3 | Sample product download page | `/free/[slug]/download?token={token}` — verify token confirmed, show download button (signed URL from `sample-products` bucket, 1hr), upsell section, entry confirmation. | Only accessible after email confirmation |
| 4B.4 | Admin user lookup | `/admin/users` — search by email/phone/name/order number. Results list → click to user detail. | Full-text search or ILIKE on multiple columns |
| 4B.5 | Admin user entry view | `/admin/users/[id]` — entry breakdown by source, entry history (scrollable list), order history. | Shows per-sweepstake and current sweepstake |
| 4B.6 | Admin entry adjustment | Form on user detail page: sweepstake (defaults to active), entries (positive or negative), notes (required). Submit creates entry row. | source = 'admin_adjustment' |
| 4B.7 | Admin entry export | `/admin/sweepstakes/[id]/export` — CSV download. Refreshes materialized view first. | Columns per §5.7 |
| 4B.8 | User entries page | `/profile/entries` — current sweepstake entry count (large number), breakdown by source (mini chart), entry history list. | Show "No active sweepstake" if none |
| 4B.9 | Sweepstakes public page | `/sweepstakes` — current prize, countdown timer, how it works, entry methods (including sample product link), link to official rules. | Show past winners if any drawn sweepstakes |
| 4B.10 | Official rules page | `/sweepstakes/rules` — static legal content. No purchase necessary, alternate entry method (sample product + popup), eligibility, prize, etc. | **EXTERNAL TASK:** Have legal review |
| 4B.11 | Admin dashboard widget | Sweepstake summary card on admin home: active sweepstake, total entries, days remaining, top users. Lead capture stats: pending confirmations, confirmed today. | Quick overview |

**Phase 4B exit criteria:** Sample product landing page captures leads and delivers file after confirmation. Admin can manage sample products, view/adjust user entries. Export produces valid CSV.

### Phase 5: Marketplace Shell (Sprint 6)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 5.1 | Service detail page | `/marketplace/[slug]` — service info with "Coming Soon" overlay. Rate display including "Custom/Inquire" for custom rate type. | No purchase flow yet |
| 5.2 | Service entries badge | Services that have `custom_entry_amount` show entry badge even in Coming Soon state. | Builds anticipation |
| 5.3 | Admin service approval | Status flow: pending → approved → active. Admin toggles in service edit form. | Only affects visibility when marketplace launches |

**Phase 5 exit criteria:** Marketplace page shows "Coming Soon" with service previews. Admin can manage services.

### Phase 6: Polish & Deploy (Sprint 7)

| # | Task | Acceptance Criteria | Notes |
|---|------|-------------------|-------|
| 6.1 | Homepage | Hero section: headline, subheadline, CTA buttons (Browse Library, Join Now). Current sweepstake prize callout. Featured e-books. How it works section. | Design-forward, not template-y |
| 6.2 | SEO | `generateMetadata()` on all pages. Dynamic OG images for e-book pages. `sitemap.xml` at `/sitemap.xml`. `robots.txt`. | Use Next.js metadata API |
| 6.3 | Mobile responsive | Test all pages at 375px, 768px, 1024px, 1440px. Fix all layout breaks. Mobile nav hamburger. | Touch targets ≥ 44px |
| 6.4 | Loading states | Skeleton loaders on library page, profile pages, admin lists. Button loading spinners on all form submissions. | shadcn/ui Skeleton component |
| 6.5 | Error handling | Global error boundary (Sentry). Toast notifications for API errors. Form validation errors inline. 404 page. 500 page. | User-friendly error messages |
| 6.6 | RLS policy audit | Test every table: anon can't read private data, users can only read own data, admin can read all. Write a test script. | Security critical |
| 6.7 | Webhook reliability | Test: double-delivery (idempotency), out-of-order events, missing events (e.g., subscription created without checkout completed). | Stripe webhook testing tool |
| 6.8 | Edge case testing | Test: buy e-book twice (should work, two orders, two entry awards), subscribe while already subscribed (blocked), submit lead capture twice same sweepstake (blocked), confirmation token expired (rejected with re-submit prompt), confirmation token already used (idempotent success), buy during no active sweepstake (entries not awarded), lead capture during no active sweepstake (no entry but still confirm email), buy with expired coupon (rejected), buy with maxed-out coupon (rejected), member buys e-book (entries based on full list price not discounted price), sample product download without confirmation (blocked). | Write checklist, test manually |
| 6.9 | Performance | Lighthouse audit. Image optimization (Next.js Image component, WebP covers). Database query optimization (check for N+1s). | Target: 90+ on all Lighthouse categories |
| 6.10 | Legal pages | Privacy policy, terms of service, sweepstakes rules content. | Placeholder content, mark as **EXTERNAL TASK** for legal review |
| 6.11 | Vercel deployment | `vercel.json` config if needed. Environment variables in Vercel dashboard. | **EXTERNAL TASK:** Domain DNS, Vercel setup |
| 6.12 | Production Supabase | Production project config, run migrations, seed data, configure auth providers. | **EXTERNAL TASK:** Create Supabase production project |
| 6.13 | Stripe live mode | Switch to live API keys. Verify webhook endpoint URL in Stripe dashboard. | **EXTERNAL TASK:** Stripe account activation |
| 6.14 | Pre-launch checklist | Verify: auth works, checkout works, webhooks fire, downloads work, emails send, admin dashboard functional, sweepstake active. | Manual smoke test |

**Phase 6 exit criteria:** Production deployment live at omniincubator.org. All core flows verified.

---

## 12. API ROUTES (Complete)

```
AUTH
  POST /api/auth/callback                    — Supabase Auth callback (OTP + Google)

WEBHOOKS
  POST /api/webhooks/stripe                  — Stripe webhook handler (public, signature verified)

PRODUCTS (Public)
  GET  /api/products                         — List products (paginated, filterable by type/category/tags)
  GET  /api/products/[slug]                  — Get product detail

E-BOOKS (Auth required)
  GET  /api/ebooks/[id]/download             — Generate signed URL + redirect (ownership check)
  GET  /api/ebooks/[id]/preview              — Public: stream preview PDF (no auth)

CHECKOUT (Auth required)
  POST /api/checkout/membership              — Create Stripe membership checkout session
  POST /api/checkout/ebook                   — Create Stripe e-book checkout session
  POST /api/checkout/ebook-with-membership   — Create combined checkout session
  POST /api/coupons/validate                 — Validate entry bonus coupon code, return entry effect (multiplier or fixed bonus)

PROFILE (Auth required)
  GET  /api/profile                          — Get own profile
  PATCH /api/profile                         — Update own profile
  GET  /api/profile/orders                   — Get own orders (paginated)
  GET  /api/profile/ebooks                   — Get own purchased e-books
  GET  /api/profile/entries                  — Get own sweepstake entries (current period)
  GET  /api/profile/subscription             — Get own subscription status

SUBSCRIPTION (Auth required)
  POST /api/subscription/portal              — Create Stripe billing portal session (handles plan switch, cancel, payment method — all via Stripe Portal)

LEAD CAPTURE (Public, rate limited)
  POST /api/lead-capture                     — Submit email/phone, sends confirmation email (no entry yet)
  POST /api/lead-capture/confirm             — Validate confirmation token, award entry, return redirect URL
  POST /api/lead-capture/resend              — Resend confirmation email by email address (rate limited: 1 per 5 min per email). Requires email in body, NOT a record ID — prevents enumeration attacks.

SAMPLE PRODUCTS (Public)
  GET  /api/sample-products/[slug]           — Get sample product detail (for landing page)
  GET  /api/sample-products/[slug]/download  — Generate signed URL for sample product file (requires valid confirmed token)

ADMIN — PRODUCTS (Admin only)
  GET    /api/admin/products                 — List all products (including inactive)
  POST   /api/admin/products                 — Create product
  PATCH  /api/admin/products/[id]            — Update product
  DELETE /api/admin/products/[id]            — Soft delete product

ADMIN — E-BOOKS (Admin only)
  POST   /api/admin/ebooks                   — Create e-book (with file upload)
  PATCH  /api/admin/ebooks/[id]              — Update e-book metadata
  POST   /api/admin/ebooks/[id]/upload       — Re-upload e-book file

ADMIN — SAMPLE PRODUCTS (Admin only)
  GET    /api/admin/sample-products          — List all sample products
  POST   /api/admin/sample-products          — Create sample product (with file upload)
  PATCH  /api/admin/sample-products/[id]     — Update sample product
  POST   /api/admin/sample-products/[id]/upload — Re-upload sample product file
  DELETE /api/admin/sample-products/[id]     — Deactivate sample product
  GET    /api/admin/sample-products/[id]/stats — Capture count, confirmation rate, conversion stats

ADMIN — SERVICES (Admin only)
  GET    /api/admin/services                 — List all services
  POST   /api/admin/services                 — Create service
  PATCH  /api/admin/services/[id]            — Update service
  DELETE /api/admin/services/[id]            — Soft delete service

ADMIN — SWEEPSTAKES (Admin only)
  GET    /api/admin/sweepstakes              — List all sweepstakes
  POST   /api/admin/sweepstakes              — Create sweepstake
  PATCH  /api/admin/sweepstakes/[id]         — Update sweepstake
  POST   /api/admin/sweepstakes/[id]/activate — Activate sweepstake
  POST   /api/admin/sweepstakes/[id]/end     — End sweepstake

ADMIN — MULTIPLIERS (Admin only)
  GET    /api/admin/sweepstakes/[id]/multipliers     — List multipliers
  POST   /api/admin/sweepstakes/[id]/multipliers     — Create multiplier
  PATCH  /api/admin/multipliers/[id]                  — Update multiplier
  DELETE /api/admin/multipliers/[id]                  — Delete multiplier

ADMIN — COUPONS (Admin only)
  GET    /api/admin/coupons                  — List all coupons
  POST   /api/admin/coupons                  — Create entry bonus coupon
  PATCH  /api/admin/coupons/[id]             — Update coupon
  
ADMIN — USERS (Admin only)
  GET    /api/admin/users                    — Search users
  GET    /api/admin/users/[id]               — User detail (profile, orders, entries, subscription)
  POST   /api/admin/users/[id]/entries       — Add admin entry adjustment

ADMIN — EXPORT (Admin only)
  GET    /api/admin/sweepstakes/[id]/export  — CSV export of entries

ADMIN — ORDERS (Admin only)
  GET    /api/admin/orders                   — List/search orders
  GET    /api/admin/orders/[id]              — Order detail

ADMIN — DASHBOARD (Admin only)
  GET    /api/admin/dashboard/stats          — Dashboard summary stats
```

---

## 13. FORTIFICATION ADDITIONS (v2)

### Items from v1 that are now integrated into the schema/plan:
1. ✅ Sweepstake legal compliance — official rules page in scope
2. ✅ Duplicate lead capture prevention — unique constraint in schema
3. ~~Entry receipt notifications~~ — **Removed:** emails cover this; in-app notifications deferred post-launch
4. ✅ Active multiplier banner — task 4.14
5. ✅ Coupon input at checkout — entry bonus coupons via task 3.5, price discounts via Stripe Promotion Codes
6. ✅ Sweepstake countdown timer — task 4B.9
7. ✅ Entry audit log — append-only entries table
8. ✅ Order number display — auto-generated by trigger
9. ✅ E-book download expiry — signed URLs generated on demand (1hr)
10. ✅ Membership status check middleware — `isActiveMember()` utility

### New additions in v2:
11. **`profiles.role` column** — admin detection was unspecified in v1. Now explicit.
12. **`profiles.stripe_customer_id`** — was missing entirely. Critical for checkout.
13. ~~`stripe_coupon_id` on coupons table~~ — **Removed:** price discounts are now handled by Stripe Promotion Codes natively. Our coupon system only manages entry bonuses.
14. **`sweepstake_entries.user_id` nullable** — required for pre-account lead capture entries.
15. **`sweepstake_entries.lead_capture_id`** — links orphaned entries to lead captures for account linking.
16. **Unique constraint on active subscriptions** — prevents double-subscribe race condition.
17. **Duplicate purchase policy** — E-book re-purchases allowed (each earns entries). Membership and non-purchase lead captures blocked from duplicates. Removed `UNIQUE(user_id, ebook_id)` constraint.
18. **Unique constraint on purchase entries per order_item** — prevents double-awarding from webhook retries.
19. **Unique constraint on active sweepstakes** — enforces single active sweepstake at DB level.
20. **Processed Stripe events table** — webhook idempotency.
21. **Email log table** — audit trail for all transactional emails.
22. **Materialized view** for entry verification (was regular view — too slow).
23. **Profile auto-creation trigger** — was mentioned but not defined in SQL.
24. **Lead capture → account linking trigger** — defined in SQL and application code.
25. **Order number auto-generation trigger** — defined in SQL.
26. **Member price auto-computation trigger** — ensures consistency.
27. **`order_items` denormalized fields** — `product_type`, `product_title`, `list_price_cents` snapshots.
28. **`orders.coupon_id` and `coupon_code`** — was missing, needed for entry calculation.
29. **`orders.stripe_invoice_id`** — needed for subscription renewal orders.
30. **`orders.is_subscription_renewal`** — distinguishes one-time purchases from recurring billing.
31. **`orders.subtotal_cents` + `discount_cents`** — was just `total_cents`, needed for coupon discount tracking.
32. **`coupons.max_uses_per_user`** — was only `max_uses` (global). Per-user limit is essential.
33. **`coupons.name`** — internal display name for admin (code is the public identifier).
34. **Multiplier overlap rule** — explicitly defined: highest wins, no stacking.
35. **No active sweepstake policy** — explicitly defined: entries silently not created, admin warning shown.
36. **$0 trial invoice handling** — explicitly defined: check `amount_paid > 0` before awarding entries.
37. **Checkout pre-checks** — existing subscription prevention. E-book duplicate purchases allowed.
38. **Storage bucket architecture** — 5 buckets: `ebooks` (private), `ebook-previews` (public), `sample-products` (private), `avatars` (public), `covers` (public).
39. **Download page as checkout success URL** — clean post-purchase flow.
40. **Marketplace email capture** — reuses lead capture system for waitlist + entries.
41. **`products.sort_order`** — admin-controlled display ordering.
42. **`products.long_description`** — markdown field for detail page (was only `description`).
43. **`products.stripe_product_id`** — was missing, needed for Stripe sync.
44. **`ebooks.format`** — supports PDF and EPUB.
45. **`subscriptions.canceled_at`** — track when cancellation was initiated.
46. ~~`notifications.dismissed`~~ — **Removed:** notification system deferred post-launch.
47. **`lead_captures.ip_address`** — abuse detection.
48. **Sentry integration** — error monitoring was unspecified.
49. ~~Supabase Realtime~~ — **Removed:** was only used for notifications, which are deferred post-launch.
50. ~~Pre-checkout page~~ — **Removed:** Stripe Checkout handles promotion codes natively (`allow_promotion_codes: true`). Upsell toggle moved to product detail page.
51. **Entries based on full list price** — member discounts do NOT reduce entry earning. `list_price_cents` added to `sweepstake_entries` for audit. Entry calculation uses product list price, not amount charged.
52. **`sweepstake_entries.list_price_cents`** — new column distinguishing the entry basis (list price) from `amount_cents` (actual dollars collected).
53. **Email confirmation for non-purchase entries** — all lead capture entries (popup + sample product) require email confirmation before entry is awarded. Prevents spam entries and validates real email addresses. `lead_captures` table gains `confirmation_token`, `confirmation_sent_at`, `confirmed_at` columns.
54. **Sample products table** — free downloadable resources used as marketing lead magnets. Configurable required fields (email always, phone optional). Each sample product gets a dedicated landing page at `/free/[slug]` with capture form, upsell section, and sweepstake callout.
55. **Sample product upsell configuration** — admin can set a primary upsell product (e-book) and toggle membership upsell on each sample product. Custom heading/body copy for the upsell section.
56. **Sample product custom entry amount** — each sample product can override the sweepstake's default `non_purchase_entry_amount`. Allows high-value lead magnets to award more entries.
57. **Confirmation token 72hr expiry** — tokens expire after 72 hours to prevent stale entries. Expired tokens prompt re-submission.
58. **Post-confirmation download gating** — sample product file is only accessible after email confirmation. Download page at `/free/[slug]/download` verifies confirmed token before generating signed URL.
59. **Resend confirmation endpoint** — users who didn't receive the confirmation email can request a resend (rate limited: 1 per 5 min per lead).
60. **`sample-products` storage bucket** — private Supabase Storage bucket for free downloadable files. Signed URLs generated on demand (1hr expiry), same pattern as paid e-books.
61. **Confirmation page** — `/confirm/[token]` handles both popup and sample product confirmations. Routes to download page (sample) or success page (popup) after confirming.
62. **Lead capture confirmation email templates** — two separate Resend templates: `lead_capture_confirm` (popup) and `sample_product_confirm` (includes cover image + product title + "unlock your download" messaging).

---

## 13.1 OPERATIONAL CONCERNS (v2 Audit Additions)

### Webhook Reliability
The idempotency approach using `processed_stripe_events` has a race condition: if the handler crashes after inserting the event ID but before completing the work, the event is marked as processed but the side effects never happened. Stripe won't retry it.

**Fix:** Wrap the entire webhook handler in a database transaction. Insert into `processed_stripe_events` AND perform all side effects (order creation, entry awarding, etc.) within the same transaction. If anything fails, the entire transaction rolls back, including the event ID — so Stripe's retry will succeed.

```typescript
// Webhook handler pattern
async function handleStripeEvent(event: Stripe.Event) {
  await db.transaction(async (tx) => {
    // Check idempotency inside the transaction (SELECT FOR UPDATE pattern)
    const existing = await tx.query(
      'INSERT INTO processed_stripe_events (event_id, event_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING event_id',
      [event.id, event.type]
    );
    if (!existing.rows.length) return; // already processed

    // All side effects happen inside the same transaction
    switch (event.type) {
      case 'checkout.session.completed': /* ... */ break;
      case 'invoice.paid': /* ... */ break;
      // ...
    }
  });
}
```

### Structured Logging
Beyond Sentry error tracking, implement structured JSON logging for:
- **Webhook processing:** event type, event ID, user ID, outcome (success/skip/error), latency
- **Entry calculations:** base entries, multipliers applied, final total, sweepstake ID
- **Checkout sessions:** user ID, product(s), coupon applied, member pricing used

Use `console.log(JSON.stringify({ ... }))` in Vercel (logs are captured automatically). For launch, this is sufficient. Consider Axiom or Logflare integration post-launch.

### Caching Strategy
- **Product pages:** Use Next.js `revalidate: 60` (ISR) on `/library` and `/library/[slug]`. Products don't change often enough to need real-time rendering.
- **Sweepstake data:** Cache active sweepstake + multiplier queries with a 60-second TTL (in-memory or via `unstable_cache`). These are queried on every product card render.
- **Admin pages:** No caching — always fresh data.
- **API routes:** No caching — mutations and user-specific data.

### Soft-Delete Consistency
All tables with `deleted_at` columns MUST include `WHERE deleted_at IS NULL` in their RLS policies and all application queries. The RLS policies in §15 already note "not deleted" for products, but this must be applied systematically to: `products`, `services`, `profiles`, and `ebooks` (via product join).

### Testing Strategy
- **Unit tests (Vitest):** Entry calculation engine (`calculateEntries`, `awardPurchaseEntries`, `awardLeadCaptureEntries`), order number generation, coupon validation logic. These are pure functions with critical business logic.
- **Integration tests:** Stripe webhook handler (use Stripe's test events), lead capture → confirmation → entry flow, checkout → order → entry flow.
- **Manual smoke test checklist:** Covered in Phase 6 task 6.8 — maintain as a runbook for each deploy.
- **No CI pipeline at launch** — test locally before deploy. Add GitHub Actions post-launch when velocity warrants it.

---

## 14. ENVIRONMENT VARIABLES

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_MONTHLY_PRICE_ID=
STRIPE_ANNUAL_PRICE_ID=

# Beehiiv
BEEHIIV_API_KEY=
BEEHIIV_PUBLICATION_ID=

# Resend (transactional email)
RESEND_API_KEY=
RESEND_FROM_EMAIL=hello@omniincubator.org

# Upstash Redis (rate limiting for lead capture endpoint)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# Rewardful (affiliate tracking)
NEXT_PUBLIC_REWARDFUL_API_KEY=

# Sentry
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_AUTH_TOKEN=

# App
NEXT_PUBLIC_SITE_URL=https://omniincubator.org
```

---

## 15. RLS POLICIES

| Table | Anonymous | Auth (own data) | Admin |
|-------|-----------|----------------|-------|
| profiles | ❌ | SELECT/UPDATE own | SELECT/UPDATE all |
| products | SELECT (active, not deleted) | SELECT (active, not deleted) | ALL |
| ebooks | SELECT (via product join, active) | SELECT (via product join, active) | ALL |
| services | SELECT (active or coming_soon) | SELECT (active or coming_soon) | ALL |
| sample_products | SELECT (active) | SELECT (active) | ALL |
| orders | ❌ | SELECT own | ALL |
| order_items | ❌ | SELECT (via own order) | ALL |
| subscriptions | ❌ | SELECT own | ALL |
| user_ebooks | ❌ | SELECT own | ALL |
| sweepstakes | SELECT (active/ended) | SELECT (active/ended) | ALL |
| sweepstake_entries | ❌ | SELECT own (where user_id = auth.uid()) | ALL |
| entry_multipliers | SELECT (active) | SELECT (active) | ALL |
| lead_captures | ❌ | ❌ | ALL |
| coupons | ❌ | ❌ (validated server-side via service role) | ALL |
| coupon_uses | ❌ | ❌ | ALL |
| email_log | ❌ | ❌ | ALL |
| processed_stripe_events | ❌ | ❌ | ALL (accessed via service role) |

**RLS implementation pattern:**
```sql
-- Example: profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));
  -- WITH CHECK prevents users from changing their own role column.
  -- The role must remain unchanged from its current value.
  -- Admin role changes are done via service role client (bypasses RLS).

CREATE POLICY "Admins can read all profiles"
  ON public.profiles FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- For webhook/service-role operations: use supabase admin client (bypasses RLS)
```

---

## 16. EXTERNAL TASKS CHECKLIST

These require human intervention (browser, account creation, credentials):

| # | Task | When Needed | Blocking? |
|---|------|------------|-----------|
| E1 | Create Supabase project (production) | Phase 1 | Yes |
| E2 | Configure Supabase Auth: enable OTP, disable magic link, enable Google provider | Phase 1 | Yes |
| E3 | Create Google Cloud OAuth client ID + secret | Phase 1 (for Google auth) | No (OTP works without it) |
| E4 | Create Stripe account, get API keys (test mode) | Phase 3 | Yes |
| E5 | Create Stripe Products + Prices for membership (or let admin CRUD handle it) | Phase 3 | Yes |
| E6 | Configure Stripe webhook endpoint URL | Phase 3 | Yes |
| E7 | Configure Stripe Customer Portal: enable plan switching (monthly ↔ annual), cancellation, and payment method updates — this is the ONLY subscription management UI | Phase 3 | Yes |
| E8 | Create Beehiiv account, get API key + publication ID | Phase 3 | No (deferrable) |
| E9 | Create Resend account, verify domain, get API key | Phase 3 | **Yes** (blocking for Phase 4A — confirmation emails are core to lead capture) |
| E10 | Create Sentry project, get DSN | Phase 1 | No |
| E11 | Deploy to Vercel, configure custom domain | Phase 6 | Yes |
| E12 | DNS: point omniincubator.org to Vercel | Phase 6 | Yes |
| E13 | Switch Stripe to live mode, update keys | Phase 6 | Yes |
| E14 | Legal review: privacy policy, terms, sweepstakes rules | Phase 6 | Soft yes (can launch with placeholder) |
| E15 | Create first sweepstake in admin dashboard | Post-deploy | Yes (or entries don't award) |
| E16 | Upload first e-books via admin dashboard | Post-deploy | Yes (empty library) |
| E17 | Create first sample product (e.g., "10 Top Business Lessons Guide") via admin dashboard — upload PDF, configure capture fields, set upsell products | Post-deploy | Yes (landing page needs content) |
| E18 | Resend domain verification for confirmation emails | Phase 3 (moved from Phase 4) | **Yes** (confirmation emails won't send without verified sender domain — blocks Phase 4A) |
| E19 | Create Upstash Redis database (free tier), get REST URL + token | Phase 4A | No (lead capture works without rate limiting, but should be configured before launch) |
| E20 | Create Rewardful account, connect Stripe, configure commission structure (% per sale, recurring vs one-time, cookie duration, payout thresholds) | Phase 3 | No (affiliate tracking is additive — checkout works without it, Rewardful snippet is a no-op without the API key) |
