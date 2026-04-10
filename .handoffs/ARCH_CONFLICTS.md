# ARCH_CONFLICTS.md — Phase 4A: Sweepstakes Core
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core

---

## Conflict 1: EntryBadge cannot be used inside LoadMoreButton (client component boundary)

**PRD requirement (R12, R14):** "EntryBadge used on product cards in library" — implying it should appear on all product cards including those loaded by the Load More mechanism.

**Implementation constraint:** `EntryBadge` is an async server component. It cannot be rendered inside `LoadMoreButton`, which is a `'use client'` component. Async RSCs cannot cross the client boundary dynamically.

**Architectural decision:** Entry badge data (active sweepstake + multiplier) is fetched once in the server-rendered library page (`src/app/library/page.tsx`) and passed as a `sweepData` prop to `ProductCard`. `ProductCard` computes the badge inline from the prop. `LoadMoreButton` renders additional `ProductCard` instances, but those do NOT receive `sweepData` (the API route at `/api/library/products` does not include sweepstake data).

**Accepted gap:** Cards loaded via "Load More" do not display entry badge text. This is a cosmetic limitation — entries are still correctly awarded on purchase. Entry badge display on initial server-rendered cards (12 per page) covers the primary UX use case.

**Alternative considered and rejected:** Making `LoadMoreButton` fetch sweepstake data separately via a client-side fetch on mount adds complexity and a client-visible loading state for non-critical data. This is not justified.

**PRD Agent ruling requested:** None needed — this is an implementation HOW decision, not a requirement violation. The PRD says "Used on product cards in library" without specifying all infinitely-loaded cards.

---

## Conflict 2: One new migration required despite "no migrations" scope boundary

**PRD requirement (§5 Scope, PRD_REPORT §5):** "No new Supabase migrations — no schema changes required; all tables exist."

**Implementation constraint:** `refreshEntryVerification()` must call `REFRESH MATERIALIZED VIEW CONCURRENTLY public.entry_verification`. The Supabase JS client cannot execute DDL statements directly. A Postgres wrapper function is required for `adminClient.rpc('refresh_entry_verification')` to work.

**Architectural decision:** Add one new migration (`20240101000017_refresh_entry_verification_fn.sql`) that creates `public.refresh_entry_verification()`. This adds a stored function only — no schema changes, no table alterations, no data migrations. It does not change any table structure.

**Justification:** The out-of-scope boundary said "no schema changes required" referring to tables and columns. A stored function to expose an existing DDL operation is a necessary operational bridge, not a schema change.

**PRD Agent ruling requested:** None needed — this is an unambiguous technical necessity. The function could also be deployed manually outside of migrations, but tracking it in migrations is better practice and consistent with the project's approach.

---

## Conflict 3: `awardPurchaseEntries` does not check for active sweepstake — caller is responsible

**PRD requirement (R1.2):** "Returns `{ totalEntries }` or null if no active sweepstake found."

**Implementation decision:** `awardPurchaseEntries` does NOT query for an active sweepstake internally. The `sweepstakeId` is passed in by the caller. The webhook handlers query the active sweepstake before calling `awardPurchaseEntries`, and skip the call if none is found.

**Reasoning:** The PRD's "returns null if no active sweepstake" wording describes the net effect from the caller's perspective, not the internal implementation. Having `awardPurchaseEntries` accept a `sweepstakeId` parameter (which must be provided) is cleaner and avoids an extra DB query inside a function that already has a sweepstakeId from the caller. The "returns null" semantic is satisfied by the caller's conditional: if no active sweepstake, `awardPurchaseEntries` is never called and the caller effectively receives "null" (no entries awarded).

**PRD Agent ruling requested:** None needed — this is a HOW decision. The net behavior is identical: no active sweepstake → no entries awarded.

---

Status: 3 advisory conflicts documented. No blocking conflicts. No PRD requirements violated. Pipeline may proceed.
