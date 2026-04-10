# ADR-011: Materialized View Export via SECURITY DEFINER Postgres Function

## Status: Accepted

## Context

The CSV export endpoint (`GET /api/admin/sweepstakes/[id]/export`) needs to return a per-user entry breakdown that joins the `entry_verification` materialized view with the `profiles` table to attach the user's email and display name.

Two implementation approaches were considered:

**Option A — Direct join in JavaScript (Supabase JS client):** Call `adminClient.from('entry_verification').select('*, profiles!inner(email, display_name)').eq('sweepstake_id', id)` from the API route. This is the idiomatic Supabase client pattern used throughout the codebase.

**Option B — SECURITY DEFINER Postgres function (chosen):** Define a `CREATE FUNCTION public.export_sweepstake_entries(p_sweepstake_id UUID) RETURNS TABLE (...)` with `SECURITY DEFINER`. Call it via `adminClient.rpc('export_sweepstake_entries', { p_sweepstake_id: id })`.

## Decision

Use a SECURITY DEFINER Postgres function (`export_sweepstake_entries`) defined in migration `20240101000018_export_sweepstake_entries_fn.sql`.

The function joins `entry_verification` with `profiles`, applies `ORDER BY total_entries DESC`, and returns exactly the 10 columns needed in the CSV: `user_email`, `display_name`, `total_entries`, `purchase_entries`, `non_purchase_entries`, `admin_entries`, `coupon_bonus_entries`, `list_price_basis_cents`, `amount_collected_cents`, `actual_order_total_cents`.

Before calling the RPC, the API route awaits `adminClient.rpc('refresh_entry_verification')` to ensure the materialized view is current.

## Consequences

**Why Option A was rejected:**

The `entry_verification` object is a materialized view, not a base table. The Supabase TypeScript codegen treats materialized views differently from base tables — the `!inner` join syntax on a materialized view does not produce typed results in the same way, causing `GenericStringError` type inference issues in the generated client types. The join can be written as a raw string, but this loses type safety and becomes brittle.

Additionally, the `profiles` table is subject to Row Level Security (RLS). The anon/service-role client distinction matters: even with the service role key, a complex join across an RLS-protected table and a materialized view requires explicit SECURITY DEFINER to execute consistently with a well-defined permission context.

**Why Option B was chosen:**

- The function body executes with the permissions of the function owner (the Postgres superuser role used by migrations), bypassing RLS on `profiles` in a controlled, auditable way. Access is still enforced at the API layer — the export route checks `profiles.role = 'admin'` before calling the RPC.
- The 10-column return shape is fixed at the database level, making the CSV column names and order stable regardless of future schema changes to the underlying view.
- Calling `rpc()` returns a typed array of the declared `RETURNS TABLE` columns, which the API route can iterate directly with a simple header + row loop.

**Trade-offs:**

- The column list and ordering logic live in SQL rather than JavaScript. Changes to export columns require a new migration.
- The `SECURITY DEFINER` designation means the function runs as its definer regardless of the calling role — this is intentional and safe here because the only code path that reaches this function is already protected by an admin auth check in the API route.
