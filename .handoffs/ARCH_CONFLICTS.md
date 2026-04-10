# ARCH_CONFLICTS.md — Phase 6: Polish & Deploy
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy

---

## Non-Blocking Deviations and Implementation Notes

These are not blocking conflicts. They are decisions where the implementation approach differs slightly from the literal PRD wording, with justification.

---

### DEVIATION-1: RLS Script Uses Supabase JS Client (Not `npx ts-node`)

**PRD wording (R8):** "Run with `npx ts-node scripts/verify-rls.ts` or `node -r tsx/esm scripts/verify-rls.ts`"

**PRD_REPORT wording (R8):** "Runnable via `npx tsx scripts/verify-rls.ts`. Verify `tsx` is in `devDependencies`."

**Implementation decision:** Use `npx tsx scripts/verify-rls.ts` (PRD_REPORT version). `ts-node` is not installed and is not required. `tsx` is being added to devDependencies as specified by PRD_REPORT. The PRD_REPORT version supersedes the original PRD wording.

**Risk note:** The RLS script's query for `pg_class.relrowsecurity` (the column that stores whether RLS is enabled per table) may not be accessible through the Supabase JS REST API. If the Supabase service role does not have access to `pg_catalog`, the script must fall back to querying `pg_policies` only (policy count per table, without RLS-enabled status). The script must handle this gracefully and exit cleanly rather than crash. The implementor must test this against their actual Supabase project.

---

### DEVIATION-2: Admin Layout Mobile Padding Added to Layout (Not Component)

**PRD_REPORT wording (R6):** Specifies the AdminSidebar mobile hamburger pattern but does not specify how to handle the content area offset caused by a `fixed`-position hamburger button.

**Implementation decision:** The admin hamburger button is `fixed top-4 left-4` (overlays content). To prevent it from obscuring page content, the admin layout's `<main>` gets `pt-16 md:pt-8` (additional top padding on mobile only). This is handled in `src/app/(admin)/layout.tsx` alongside the metadata export change (SPEC §3.25), not in the sidebar component itself. This is the correct architectural location since layout is responsible for content flow.

---

### DEVIATION-3: `og-banner.png` Is a Human-Created Asset

**PRD_REPORT wording (WARN-5):** "A programmatically generated placeholder is acceptable for launch."

**Implementation decision:** The spec does not include code to auto-generate the PNG because adding a build-time dependency (e.g., `canvas` npm package) would be disproportionate for a one-time asset. The task is delegated to the implementor as D2 with clear instructions. This is not a code-level conflict.

---

### DEVIATION-4: `admin/orders` and `admin/ebooks` `overflow-x-auto` on Placeholder Content

**PRD_REPORT wording (WARN-7, R6):** "The `overflow-x-auto` wrapper should be added to the table wrapper, even if the table is placeholder content."

**Implementation decision:** Since these pages are still "Coming in a future phase" placeholders with no actual table, the `overflow-x-auto` div wraps the placeholder `<p>` element. This satisfies the acceptance criterion (AC 23) structurally even though there is no table yet. When real tables are added in a future phase, the wrapper is already in place.

---

## Confirmed No-Conflict Items

- `navbar-auth.tsx` raw `<img>` replacement: clean swap with `next/image`, no API changes.
- `filter-sidebar.tsx`: component is reusable as-is inside Sheet; no changes to its logic required.
- `admin-sidebar.tsx`: converting from server component to `'use client'` is safe — it has no async data fetching and does not depend on server context.
- All metadata exports: additive changes only, no existing exports modified except root layout.
- `vercel.json`: additive headers block; functions block unchanged.
- `sitemap.ts` and `robots.ts`: new files, no conflicts with existing routing.
- Button spinner audit: `CheckoutButton` and `PricingCards` already have correct disabled+spinner pattern; only toast error integration is new.

---

Status: DEVIATIONS DOCUMENTED — no blocking conflicts. Architect may proceed.
