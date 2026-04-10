-- Phase 1: Foundation — Sweepstakes, Entry Multipliers, Coupons, Coupon Uses, Sweepstake Entries

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
