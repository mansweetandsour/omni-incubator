-- Phase 3: Billing — claim_stripe_event RPC for idempotent webhook processing

CREATE OR REPLACE FUNCTION public.claim_stripe_event(
  p_event_id TEXT,
  p_event_type TEXT
)
RETURNS TABLE(event_id TEXT) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO public.processed_stripe_events (event_id, event_type)
  VALUES (p_event_id, p_event_type)
  ON CONFLICT (event_id) DO NOTHING
  RETURNING public.processed_stripe_events.event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
