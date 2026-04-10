CREATE OR REPLACE FUNCTION public.refresh_entry_verification()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification;
END;
$$;
