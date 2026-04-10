# ADR-009: Pure Function Design for calculateEntries

## Status: Accepted

## Context

Phase 4A requires entry calculation in multiple call sites: the Stripe webhook handler (purchase entries), the lead capture confirmation route (non-purchase entries), and future contexts such as admin entry previews or batch recalculation jobs.

Two implementation patterns were considered:

**Option A — Embed DB calls in the calculation function:** `calculateEntries` fetches the active sweepstake, multiplier, and coupon from Supabase internally and returns `totalEntries`. The caller just provides a product and amount.

**Option B — Caller pattern (chosen):** `calculateEntries` is a pure function. It takes already-resolved inputs (`baseEntries`, `globalMultiplier`, `couponMultiplier`, `bonusEntries`) and returns `totalEntries`. The caller is responsible for fetching the sweepstake, multiplier, and coupon from the DB before invoking the function.

## Decision

Use the caller pattern (Option B). `calculateEntries` and `computeLeadCaptureEntries` are pure functions with no I/O. DB writes are isolated in `awardPurchaseEntries` and `awardLeadCaptureEntries`, which fetch the required records and then call the pure functions.

## Consequences

**Enables:**
- Unit testing of entry calculation logic without any DB mocking or environment setup — tests pass in any Node.js environment with no Supabase connection. All 7 Vitest tests exercise the pure functions directly.
- Reuse: the same `calculateEntries` function can be called from admin preview endpoints, batch jobs, or API routes without pulling in any Supabase client dependency.
- The calculation logic is auditable in isolation — a bug in multiplier stacking or bonus arithmetic is visible in the test file without tracing through DB query paths.

**Makes harder:**
- Callers that need entry estimates must know which DB fields to fetch and pass them correctly. This is mitigated by `awardPurchaseEntries` and `awardLeadCaptureEntries` serving as the canonical entry points for all production call sites.
- Adding a new input to the calculation (e.g., a new coupon type) requires updating both the pure function signature and every caller that prepares inputs. The current caller count is two (`awardPurchaseEntries`, `awardLeadCaptureEntries`), so this is low friction at the current scale.
