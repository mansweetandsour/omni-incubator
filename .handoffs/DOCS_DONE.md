# DOCS_DONE.md — Phase 1: Foundation

**Overall result: PASS**
**Date:** 2026-04-09
**Phase:** 1 — Foundation

---

## Files Updated

| File | Change |
|---|---|
| `README.md` | Replaced create-next-app stub with full project README covering: overview, tech stack, prerequisites, local dev setup steps, project directory structure, environment variables summary, and links to all key docs |

---

## Files Created

| File | Description |
|---|---|
| `docs/adr/ADR-001-supabase-client-variants.md` | Why the codebase uses three separate Supabase client modules (browser, server, admin/service-role) |
| `docs/adr/ADR-002-migration-strategy.md` | Why Supabase CLI migrations were chosen; file naming convention; deferred FK rationale; 14-file migration sequence documented |
| `docs/adr/ADR-003-auth-strategy.md` | Why Email OTP + Google OAuth was chosen over magic links and passwords; full flow description for both auth paths; session management via `@supabase/ssr` |
| `docs/adr/ADR-004-shadcn-ui.md` | Why shadcn/ui was chosen; list of all 11 components installed in Phase 1; v2 deviation notes (render prop, sonner Toaster) |
| `docs/runbooks/runbook-local-dev-setup.md` | Step-by-step guide for a new developer: install, env vars, migrations, storage buckets, auth config, start server, verification checklist, common issues |
| `docs/runbooks/runbook-database-migrations.md` | How to write, name, apply, and roll back migrations; deferred FK explanation; RLS policy pattern; materialized view refresh |
| `docs/runbooks/runbook-external-tasks.md` | Full checklist of all 20 external tasks (E1–E20) from the blueprint, organized by phase, with step-by-step instructions and checkbox tracking |

---

## Files Reviewed — No Changes Needed

| File | Finding |
|---|---|
| `supabase/storage.md` | Accurate and complete as written by the Backend agent. Documents all 5 buckets, access levels, CORS config, file path conventions, and signed URL guidance. No updates required. |
| `supabase/auth-config.md` | Accurate and complete. Documents OTP settings, magic link disable, Google OAuth setup steps, and rate limit guidance. No updates required. |
| `.env.local.example` | Accurate and complete. All 18 variables documented with inline comments, section headers, and source locations. No updates required. |

---

## ADRs Created

| ADR | Title | File |
|---|---|---|
| ADR-001 | Three Supabase Client Variants | `docs/adr/ADR-001-supabase-client-variants.md` |
| ADR-002 | Database Migration Strategy | `docs/adr/ADR-002-migration-strategy.md` |
| ADR-003 | Auth Strategy — Email OTP and Google OAuth | `docs/adr/ADR-003-auth-strategy.md` |
| ADR-004 | shadcn/ui Component Library | `docs/adr/ADR-004-shadcn-ui.md` |

---

## Documentation Debt Flagged

| Item | Reason deferred |
|---|---|
| API endpoint documentation (`/api/auth/callback`) | Only one API route exists in Phase 1. A formal API reference doc is premature until Phase 3 adds Stripe webhook handlers and Phase 4A adds lead capture endpoints. Create `docs/api-reference.md` in Phase 3. |
| `admin.ts` `server-only` import guard | ADR-001 notes that `admin.ts` relies on convention to prevent client-bundle inclusion. Adding `import 'server-only'` at the top of `src/lib/supabase/admin.ts` would make this a hard error at build time. Deferred to a hardening sprint. |
| Next.js 16 middleware deprecation | QA OBS-1: `src/middleware.ts` is deprecated in Next.js 16 in favour of `src/proxy.ts`. Not a Phase 1 blocker but should be migrated before a future Next.js release makes it a hard error. |
| Sweepstakes official rules page | `/sweepstakes/rules` is a placeholder. Content requires legal review (External Task E14). |
| Homepage content | `src/app/page.tsx` is a placeholder. Phase 6 deliverable. |
