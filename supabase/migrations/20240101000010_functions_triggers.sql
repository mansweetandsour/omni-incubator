-- Phase 1: Foundation — Functions and Triggers
-- Created AFTER all tables (including lead_captures) exist — resolves WARN-4

-- ============================================================
-- set_updated_at: applied to all tables with updated_at column
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
