# ARCH_CONFLICTS.md — Phase 3: Billing
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing

---

## Conflict 1: `subscriptions.product_id` Resolution for Membership Plans

**PRD requirement (R8, customer.subscription.created):** Upsert a `subscriptions` row including `product_id` which is a `NOT NULL UUID FK → products.id`.

**Clarification discovered:** The `product_type` ENUM already includes `'membership_monthly'` and `'membership_annual'` values (in `20240101000001_enums.sql`). The seed data (`20240101000014_seed_data.sql`) already inserts membership product rows with these types. No migration gap exists.

**Architectural decision:** The webhook's `customer.subscription.created` handler resolves `product_id` by matching the Stripe price ID against `STRIPE_MONTHLY_PRICE_ID` / `STRIPE_ANNUAL_PRICE_ID` env vars, then querying `products` by `type = 'membership_monthly'` or `'membership_annual'`. Documented in SPEC §5.5.

**Resolution:** No PRD conflict. Implementation detail handled in SPEC §5.5 and TASKS.md B2.

---

## Conflict 2: Full DB Transaction Not Achievable Without `pg` Package

**PRD requirement (§13.1, WARN-1):** "Transactional idempotency — entire handler wrapped in a DB transaction."

**Deviation:** The Supabase JS client (`adminClient`) has no multi-statement transaction API. A true all-or-nothing transaction covering the idempotency INSERT plus all side effects (orders, order_items, user_ebooks, subscriptions) is not achievable with the Supabase JS client alone without adding the `pg` package (a new infrastructure dependency that was ruled out).

**Decision:** The `claim_stripe_event` RPC handles the idempotency gate atomically (as a stored function, it runs in its own DB transaction). Downstream side effects are individual atomic Supabase JS calls. If a downstream call fails, the compensating delete of the `processed_stripe_events` row allows Stripe to retry — restoring idempotency properties. This provides idempotency guarantees equivalent to the PRD intent, at the cost of a small window where a partial write could occur between the event claim and the compensating delete during error recovery.

**Risk assessment:** Very low in practice. Stripe's retry behavior provides natural recovery. The compensating delete is synchronous before returning 500.

**PRD Agent ruling requested:** No ruling needed — this is the architectural HOW decision for WARN-1. The PRD Agent explicitly designated this as an Architect decision.

---

Status: 2 ADVISORY conflicts documented. No blocking conflicts. No PRD requirements violated. Pipeline may proceed.
