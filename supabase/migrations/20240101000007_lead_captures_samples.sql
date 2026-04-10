-- Phase 1: Foundation — Lead Captures and Sample Products tables
-- lead_captures must exist BEFORE handle_new_user trigger (migration 10)
-- lead_captures.sample_product_id FK is deferred (sample_products not yet created)

CREATE TABLE public.lead_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  phone TEXT,
  ip_address INET,
  user_id UUID REFERENCES public.profiles(id),
  source TEXT DEFAULT 'popup',
  sample_product_id UUID,  -- FK added in 20240101000009_deferred_fks.sql
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
