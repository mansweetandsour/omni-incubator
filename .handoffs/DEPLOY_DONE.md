# DEPLOY_DONE.md — Phase 4A: Sweepstakes Core

**Result: APPROVED**
**Date:** 2026-04-09
**Phase:** 4A — Sweepstakes Core

---

## Summary

Phase 4A is build-clean and infra-ready. QA confirmed 52 routes compile cleanly, 7/7 Vitest tests pass, and `tsc --noEmit` produces 0 errors. Both Upstash environment variables are present in `.env.local.example`. Vitest is correctly in `devDependencies`, not `dependencies`. No hardcoded secrets found in any new or modified Phase 4A file. One new migration file exists and must be applied before deployment. E15 (create first sweepstake) and E19 (Upstash Redis) are needed before launch.

---

## Task Results

### Task 1 — Build Clean Verification

**PASS — Confirmed by QA**

QA Agent (re-validation run) confirmed:

```
npm run build
→ 52 routes compiled
→ TypeScript: 0 errors
→ Next.js build: PASS

npx vitest run
→ 7/7 tests pass

node node_modules/typescript/bin/tsc --noEmit
→ 0 errors
```

No re-run required.

---

### Task 2 — `.env.local.example` Upstash Coverage

**PASS**

`.env.local.example` lines 27–28:

```
UPSTASH_REDIS_REST_URL=                    # Upstash Redis REST URL for rate limiting lead capture endpoint
UPSTASH_REDIS_REST_TOKEN=                  # Upstash Redis REST token (server only)
```

Both variables are present with descriptive inline comments. The values are intentionally empty (local default = rate limiting skipped). The lead capture endpoints function without these variables; rate limiting is simply not applied.

---

### Task 3 — Vitest in devDependencies

**PASS**

`package.json` `devDependencies`:
```json
"vitest": "^2.1.9",
"@vitest/coverage-v8": "^2.1.9"
```

`package.json` `dependencies`: no `vitest` entry.

Vitest is a test-only tool and correctly placed in `devDependencies`. It is excluded from the production bundle. `npm run build` does not include Vitest in the output. Scripts:
```json
"test": "vitest run",
"test:watch": "vitest"
```

---

### Task 4 — E19 Upstash Redis Status

**NOTED**

Upstash Redis is used in `src/app/api/lead-capture/route.ts` and `src/app/api/lead-capture/resend/route.ts` for IP-based rate limiting. The guard at the top of each route:

```typescript
if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  // skip rate limiting — proceed without it
}
```

**Without Upstash configured:**
- `/api/lead-capture` — no IP-based rate limiting (5/IP/hr); endpoint remains fully functional
- `/api/lead-capture/resend` — Upstash 1/5min per-email rate limit skipped; the DB-level guard (queries `confirmation_sent_at`) still enforces a 5-minute cooldown as a fallback
- No errors or 500s; graceful degradation

**E19 is needed before launch.** Without it, a single IP can flood the lead capture endpoint. The DB-level resend cooldown provides partial protection but does not defend the initial submit path.

See `docs/runbooks/runbook-external-tasks.md` § E19 for setup instructions.

---

### Task 5 — Hardcoded Secrets Audit

**PASS — No hardcoded secrets found**

Scanned all new and modified Phase 4A files for hardcoded credential patterns:
- Stripe key prefixes: `sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`, `whsec_`
- Upstash patterns: `redis://`, fixed bearer token strings
- Resend key prefix: `re_`
- JWT/base64 credential patterns: `eyJ`

**New files audited:**
- `src/lib/sweepstakes.ts`
- `src/lib/__tests__/sweepstakes.test.ts`
- `vitest.config.ts`
- `src/app/api/lead-capture/route.ts`
- `src/app/api/lead-capture/confirm/route.ts`
- `src/app/api/lead-capture/resend/route.ts`
- `src/emails/lead-capture-confirm.tsx`
- `src/emails/sample-product-confirm.tsx`
- `src/app/(admin)/admin/sweepstakes/actions.ts`
- `src/app/actions/sweepstakes.ts`
- All new admin pages and components under `src/app/(admin)/admin/sweepstakes/` and `src/app/(admin)/admin/coupons/`
- `src/components/sweepstakes/` (all 4 files)
- `src/app/confirm/[token]/page.tsx`
- `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql`

**Result: 0 matches.** All environment variables accessed exclusively via `process.env.*`.

---

## New Environment Variables (Phase 4A)

| Variable | Required | Guard behavior | Source |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | No — needed before launch | Absent → rate limiting skipped | Upstash Console → database → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | No — needed before launch | Absent → rate limiting skipped | Upstash Console → database → REST token |

Both variables were pre-added to `.env.local.example` in Phase 3 anticipation. No `.env.local.example` change required.

Add both to Vercel Dashboard → Settings → Environment Variables before launch.

---

## Infrastructure Resources Created or Modified

| Resource | Type | Change |
|---|---|---|
| `supabase/migrations/20240101000017_refresh_entry_verification_fn.sql` | Postgres function | New — `public.refresh_entry_verification()` SECURITY DEFINER wrapper for `REFRESH MATERIALIZED VIEW CONCURRENTLY` |
| `vitest.config.ts` | Dev tooling config | New — Vitest config with `@` path alias and `node` environment |

No new Vercel config changes. No new Supabase Storage buckets. No new cloud services beyond Upstash (external, configured by E19). No Docker/compose changes required.

**Migration must be applied before deployment:**
```bash
supabase db push
# Verify:
# SELECT routine_name FROM information_schema.routines WHERE routine_name = 'refresh_entry_verification';
```

---

## Staging / Production URLs

| Environment | URL |
|---|---|
| Production | `https://omniincubator.org` (pending E11 — Vercel setup) |
| Local dev | `http://localhost:3000` |

---

## CI/CD Pipeline

No changes. Deployment is via Vercel git integration (push to `main` triggers build + deploy). Vitest is not run in CI yet — no GitHub Actions workflow exists. Consider adding a CI step in Phase 6 pre-launch hardening.

---

## Rollback Procedure

1. In Vercel Dashboard → project → **Deployments** tab
2. Locate the previous known-good deployment
3. Click three-dot menu → **Promote to Production**
4. Traffic is instantly re-routed — no rebuild required

**Database rollback note:** Phase 4A includes 1 new migration. Rolling back application code while leaving the migration applied is safe — `refresh_entry_verification` is additive and not called by Phase 3 code. If a full DB rollback is needed:
```sql
DROP FUNCTION IF EXISTS public.refresh_entry_verification();
```
Only do this if application code is also being rolled back.

---

## External Tasks Needed Before Launch (Phase 4A additions)

| Task | Description | Consequence if missing |
|---|---|---|
| **E15** | Create first sweepstake in admin dashboard and activate it | Entry badges do not appear; lead capture popup does not appear; no entries are awarded for any purchase or lead capture |
| **E19** | Create Upstash Redis database, add REST URL + token to environment | Lead capture submit endpoint has no IP-based rate limiting; resend endpoint DB cooldown still applies |

Existing external tasks from Phase 3 (E4, E6, E9/E18, E8) remain required. See `docs/runbooks/runbook-external-tasks.md` for the full checklist.
