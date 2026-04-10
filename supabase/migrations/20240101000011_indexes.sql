-- Phase 1: Foundation — Performance indexes

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
