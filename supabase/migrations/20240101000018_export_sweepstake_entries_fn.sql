CREATE OR REPLACE FUNCTION public.export_sweepstake_entries(p_sweepstake_id UUID)
RETURNS TABLE (
  user_email TEXT,
  display_name TEXT,
  total_entries BIGINT,
  purchase_entries BIGINT,
  non_purchase_entries BIGINT,
  admin_entries BIGINT,
  coupon_bonus_entries BIGINT,
  list_price_basis_cents BIGINT,
  amount_collected_cents BIGINT,
  actual_order_total_cents BIGINT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    p.email          AS user_email,
    p.display_name,
    ev.total_entries,
    ev.purchase_entries,
    ev.non_purchase_entries,
    ev.admin_entries,
    ev.coupon_bonus_entries,
    ev.entries_list_price_basis  AS list_price_basis_cents,
    ev.entries_amount_collected  AS amount_collected_cents,
    ev.actual_order_total        AS actual_order_total_cents
  FROM public.entry_verification ev
  JOIN public.profiles p ON p.id = ev.user_id
  WHERE ev.sweepstake_id = p_sweepstake_id
  ORDER BY ev.total_entries DESC;
$$;
