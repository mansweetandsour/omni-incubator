-- Phase 1: Foundation — Materialized views
-- entry_verification: used for sweepstakes audit/compliance

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
