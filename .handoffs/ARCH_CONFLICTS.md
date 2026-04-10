# ARCH_CONFLICTS.md — Phase 4B: Sample Products & Admin Tools
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 4B — Sample Products & Admin Tools

---

## Conflict 1 — CSV export requires one new migration (RPC function)

**PRD_REPORT.md states (R7, Cross-Phase Dependencies):**
> "All schema tables complete — no new migrations" and "refresh_entry_verification Postgres RPC function confirmed present."

**Architect decision:**
A second RPC function `export_sweepstake_entries` must be added as a new migration (`20240101000018`). The Supabase JS client cannot perform a JOIN between the `entry_verification` materialized view and the `profiles` table using its normal `.select()` FK syntax — materialized views do not have the Supabase-tracked foreign key metadata that enables the `profiles!inner(...)` join shorthand. To avoid fetching all rows and performing a N+1 profile lookup in application code, the cleanest and most correct approach is a `SECURITY DEFINER` SQL function that executes the join server-side and returns the already-aliased columns needed for the CSV export. This is a single small migration (1 function) and is wholly additive — it does not change any existing table, view, or function.

**Impact:** One additional migration file. This is a schema-safe addition. DevOps task D1 covers applying it.

---

## Conflict 2 — `file_path NOT NULL` constraint vs. save-then-upload UX pattern

**PRD_REPORT.md states (R1.2):**
> "`file_path` (file upload → Supabase Storage `sample-products` bucket, private; store resulting path in `file_path` column; required)"

**Architect decision:**
The `sample_products.file_path` column is `NOT NULL` (confirmed in migration `20240101000007`). However, adopting the same "save product first, then upload files" UX pattern used for ebook products (where file upload sections are disabled until after first save) means the initial `createSampleProduct` insert must write a valid non-null value before any file is uploaded. The chosen approach is `file_path = ''` (empty string) on create. The upload API (`POST /api/admin/sample-products/[id]/upload`) then sets the real path. Admins should not be able to make a product `is_active = true` with an empty file_path — the edit form can add a client-side warning if `file_path` is empty and `is_active` is being toggled on. The Backend agent must ensure the initial insert uses `''` and the TypeScript type for `file_path` in the Server Action does not reject empty string.

This is a minor deviation from the strict reading of "required" in the PRD, but it is technically necessary given the two-step UX flow and the existing project pattern. No PRD ruling is needed — it does not change observable product behavior (the file is set before the product is made active and accessible to users).

---

Status: 2 conflicts above — both advisory, no PRD ruling required. Implementation decisions are fully specified in SPEC.md. Pipeline may proceed.
