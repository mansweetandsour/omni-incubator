Status: NONE

---

## Architect Notes (Non-Conflicts)

The following advisory findings from PRD_REPORT.md were addressed in SPEC.md without requiring conflict rulings:

**WARN-1 (env var count mismatch):** SPEC.md §14 and TASKS.md B7 specify all 18 environment variables. The acceptance criterion "14 keys" is treated as stale; all 18 keys from §14 of the blueprint are included in `.env.local.example`.

**WARN-2 (processed_stripe_events RLS ambiguity):** SPEC.md §6 explicitly enables RLS on `processed_stripe_events` with zero permissive policies. The table is accessible only via the service-role admin client (which bypasses RLS). This is documented in the migration SQL comment.

**WARN-3 (Storage bucket creation):** Confirmed as a documentation-only deliverable. SPEC.md §15 and TASKS.md B8 produce `supabase/storage.md` and `supabase/auth-config.md`. No setup script is included in Phase 1 — the documentation approach is sufficient for this phase and reduces unnecessary scope. A `scripts/create-buckets.ts` can be added as a later task if the operator needs it.

**WARN-4 (handle_new_user references lead_captures):** Resolved by migration ordering. `handle_new_user` function and trigger are in migration file `20240101000010_functions_triggers.sql`, which runs after `20240101000007_lead_captures_samples.sql`. The `lead_captures` table is guaranteed to exist before the trigger function is created. PL/pgSQL late-binding provides a second layer of safety even if migration order were different, but the explicit ordering eliminates any ambiguity.

**Implementation decision — orders.order_number default:** The blueprint and PRD specify `BEFORE INSERT WHEN (order_number IS NULL)` as the trigger condition. However, the `order_number` column has `NOT NULL UNIQUE` which would reject a NULL value before the trigger fires in some Postgres versions. SPEC.md resolves this by adding `DEFAULT ''` on the column and updating the trigger condition to `WHEN (NEW.order_number IS NULL OR NEW.order_number = '')`. This ensures the trigger fires when the column is at its default empty string, which satisfies the NOT NULL constraint and still generates the OMNI-... format on insert.
