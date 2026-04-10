-- Phase 5: Marketplace Shell — add custom_entry_amount to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS custom_entry_amount INTEGER;
