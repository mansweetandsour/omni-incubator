-- Phase 1: Foundation — Row Level Security policies
-- Admin check pattern: correlated subquery on profiles.role

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
