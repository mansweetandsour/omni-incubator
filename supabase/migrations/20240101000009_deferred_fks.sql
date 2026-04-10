-- Phase 1: Foundation — Deferred foreign key constraints
-- Adds the three circular/deferred FKs after all tables exist

ALTER TABLE public.orders
  ADD CONSTRAINT fk_orders_coupon
  FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);

ALTER TABLE public.sweepstake_entries
  ADD CONSTRAINT fk_entries_lead_capture
  FOREIGN KEY (lead_capture_id) REFERENCES public.lead_captures(id);

ALTER TABLE public.lead_captures
  ADD CONSTRAINT fk_lead_captures_sample_product
  FOREIGN KEY (sample_product_id) REFERENCES public.sample_products(id);
