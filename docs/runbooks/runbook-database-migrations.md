# Runbook: Database Migrations

This runbook covers how to write, review, and apply database schema changes using Supabase CLI migrations.

---

## Overview

All schema changes are versioned as plain SQL files in `supabase/migrations/`. Files are applied in lexicographic order, so the timestamp prefix determines execution order. Once a migration file has been applied to a database, it must not be edited — write a new file for any changes.

---

## File naming convention

```
YYYYMMDD HHMMSS_short_description.sql
```

Example: `20240201120000_add_referral_code_to_profiles.sql`

Use the current UTC date and time when creating a new file. Ensure the timestamp is strictly greater than the last existing migration file so it sorts after all previously applied migrations.

---

## Writing a new migration

1. Create the file in `supabase/migrations/` with the correct timestamp prefix:

   ```bash
   # Example: adding a column to profiles
   touch supabase/migrations/$(date -u +%Y%m%d%H%M%S)_add_referral_code_to_profiles.sql
   ```

2. Write the SQL. Follow these conventions:
   - Use `IF NOT EXISTS` / `IF EXISTS` guards where appropriate to make migrations idempotent.
   - Use `ALTER TABLE` for column additions — never drop and recreate a table.
   - New RLS policies should be in the same migration file as the table or column they protect (or a dedicated RLS migration if touching many tables).
   - Indexes should be `CREATE INDEX CONCURRENTLY` in production migrations to avoid locking. In migrations applied via `supabase db reset` (development only), regular `CREATE INDEX` is fine.
   - Always update `updated_at` trigger coverage if adding a new table that has an `updated_at` column (see `supabase/migrations/20240101000010_functions_triggers.sql` for the pattern).

3. Test locally with `supabase db reset` before pushing to staging or production.

---

## Applying migrations

### Development (local / linked project)

```bash
# Push new migrations only (does not reset existing data)
supabase db push

# Reset to clean state: drops everything, re-applies all migrations, runs seed data
supabase db reset
```

### Staging / Production

```bash
# Link to the target environment first
supabase link --project-ref <project-ref>

# Push migrations
supabase db push
```

`supabase db push` applies only migrations that have not yet been applied (tracked by file hash in `supabase_migrations.schema_migrations`). It never drops data.

---

## Reviewing migration state

```bash
# List applied and pending migrations
supabase migration list
```

---

## Deferred foreign keys

Three foreign key constraints in this codebase are DEFERRABLE INITIALLY DEFERRED (migration `20240101000009_deferred_fks.sql`):

- `orders.coupon_id → coupons.id`
- `sweepstake_entries.lead_capture_id → lead_captures.id`
- `lead_captures.sample_product_id → sample_products.id`

These exist to resolve circular table dependencies that would otherwise prevent creation in a single transaction. Deferrable constraints are checked at transaction COMMIT rather than at each statement. This is correct behavior — do not change them to immediate constraints.

---

## RLS policies

Every table must have Row Level Security enabled. The pattern:

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

-- Users can only read their own rows
CREATE POLICY "Users can read own rows"
  ON public.my_table FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own rows
CREATE POLICY "Users can insert own rows"
  ON public.my_table FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

The service role client (`src/lib/supabase/admin.ts`) bypasses RLS entirely. Only use it in server-side webhook handlers and admin operations that explicitly need to act on behalf of any user.

---

## Storage buckets

Storage buckets cannot be created via migration files. They must be created manually. See [supabase/storage.md](../../supabase/storage.md).

---

## Materialized views

The `entry_verification` materialized view (migration `20240101000012`) must be refreshed manually after sweepstake data changes:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification;
```

The `CONCURRENTLY` option requires the unique index (`idx_entry_verification_pk`) to exist, which is created in the same migration. `CONCURRENTLY` does not lock reads, making it safe for production refresh jobs.

---

## Rollback procedure

Supabase CLI does not provide automatic rollbacks. To reverse a migration:

1. Write a new migration file that reverses the previous change (e.g., `DROP COLUMN`, `DROP TABLE`, `DROP INDEX`).
2. Apply it with `supabase db push`.

For destructive rollbacks in production, coordinate with the team before applying — dropped columns and tables cannot be recovered without a backup.
