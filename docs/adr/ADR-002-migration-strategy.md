# ADR-002: Database Migration Strategy

## Status: Accepted

## Context

The application needs a reproducible, version-controlled way to evolve the database schema across development, staging, and production environments. Options considered:

1. **Supabase Dashboard SQL editor** — ad hoc, not version controlled, impossible to reproduce exactly.
2. **Prisma Migrate** — requires a separate ORM layer on top of Supabase, adds complexity, and conflicts with Supabase's native RLS and Postgres functions.
3. **Supabase CLI migrations** — first-class support in the Supabase ecosystem, stores migration files in the repo, applies them with `supabase db push` or `supabase db reset`.
4. **Flyway / Liquibase** — third-party tools, require additional configuration, no native Supabase integration.

## Decision

Use **Supabase CLI migrations** with timestamped SQL files stored in `supabase/migrations/`.

File naming convention: `YYYYMMDD HHMMSS_description.sql` (e.g., `20240101000001_enums.sql`). Files are applied in lexicographic order, so the timestamp prefix determines execution order.

Phase 1 created 14 migration files in dependency order:

1. `20240101000001_enums.sql` — custom ENUM types (must precede tables that use them)
2. `20240101000002_profiles.sql` — profiles table (references `auth.users`)
3. `20240101000003_products_ebooks.sql` — products + ebooks
4. `20240101000004_services.sql` — services table
5. `20240101000005_orders_billing.sql` — orders, order_items, subscriptions, user_ebooks
6. `20240101000006_sweepstakes_core.sql` — sweepstakes, entry_multipliers, coupons, coupon_uses, sweepstake_entries
7. `20240101000007_lead_captures_samples.sql` — lead_captures + sample_products
8. `20240101000008_email_stripe_tables.sql` — email_log + processed_stripe_events
9. `20240101000009_deferred_fks.sql` — deferred foreign key constraints resolving circular references
10. `20240101000010_functions_triggers.sql` — PL/pgSQL functions and triggers
11. `20240101000011_indexes.sql` — performance indexes
12. `20240101000012_materialized_views.sql` — `entry_verification` materialized view
13. `20240101000013_rls_policies.sql` — Row Level Security for all tables
14. `20240101000014_seed_data.sql` — membership product seed rows

**Deferred foreign keys** (migration 9) are used to resolve three circular references that cannot be satisfied by creation order alone:
- `orders.coupon_id → coupons.id`
- `sweepstake_entries.lead_capture_id → lead_captures.id`
- `lead_captures.sample_product_id → sample_products.id`

## Consequences

**Enables:**
- Any developer or CI pipeline can reproduce the exact database state with `supabase db reset`.
- Schema changes are code-reviewed alongside application changes in the same pull request.
- Rollbacks are explicit: write a new down migration file.

**Makes harder:**
- Migrations are append-only. Editing an already-applied migration file will cause `supabase db push` to error (the CLI tracks applied migrations by file hash). Always write a new file for changes.
- There is no automatic rollback. A failed migration must be manually reversed with a new migration or by dropping and re-creating the database in development.
- Storage buckets cannot be created via SQL — they require manual creation or the Supabase Management API. See `supabase/storage.md`.
