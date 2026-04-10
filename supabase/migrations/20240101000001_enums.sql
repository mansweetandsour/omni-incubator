-- Phase 1: Foundation — ENUM types
-- Must be created before any table that references them

CREATE TYPE product_type AS ENUM ('ebook', 'membership_monthly', 'membership_annual', 'service');
CREATE TYPE service_rate_type AS ENUM ('hourly', 'fixed', 'monthly', 'custom');
CREATE TYPE order_status AS ENUM ('pending', 'completed', 'failed');
CREATE TYPE coupon_entry_type AS ENUM ('multiplier', 'fixed_bonus');
CREATE TYPE entry_source AS ENUM ('purchase', 'non_purchase_capture', 'admin_adjustment', 'coupon_bonus');
