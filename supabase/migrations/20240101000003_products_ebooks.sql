-- Phase 1: Foundation — Products and Ebooks tables

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
