-- Phase 1: Foundation — Seed data
-- Inserts the two membership products required for Stripe integration

INSERT INTO public.products (slug, type, title, description, price_cents, is_active) VALUES
  (
    'omni-membership-monthly',
    'membership_monthly',
    'Omni Membership — Monthly',
    'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace.',
    1500,
    true
  ),
  (
    'omni-membership-annual',
    'membership_annual',
    'Omni Membership — Annual',
    'Full access to the Omni Incubator ecosystem. Includes 50% off all e-books, monthly newsletter, sweepstake entries on every dollar spent, and early access to the service marketplace. Save $51/year vs monthly.',
    12900,
    true
  );
