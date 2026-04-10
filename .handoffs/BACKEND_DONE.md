# BACKEND_DONE.md — Phase 6: Polish & Deploy
**Agent:** Backend Agent
**Date:** 2026-04-09
**Phase:** 6 — Polish & Deploy

---

## Files Created

| File | Task | Description |
|---|---|---|
| `src/app/sitemap.ts` | B1 | Dynamic sitemap — 8 static routes + ebooks, sample products, services from Supabase |
| `src/app/robots.ts` | B2 | Robots file — disallows /admin/ and /profile/, includes sitemap URL |
| `scripts/verify-rls.ts` | D3 | RLS audit script — queries pg_policies + pg_tables, categorized OK/DANGER/WARNING report |
| `docs/runbooks/runbook-rls-audit.md` | D5 | Runbook documenting prerequisites, how to run, how to interpret output, corrective actions |
| `docs/runbooks/pre-launch-checklist.md` | D6 | Pre-launch checklist with 10 sections and 3+ items each |
| `public/og-banner.png` | D2 | 1200×630px PNG placeholder (solid #18181b background, 3.6KB) |
| `public/og-banner.svg` | D2 | SVG version of OG banner with branded text (fallback/reference) |

## Files Modified

| File | Task | Change |
|---|---|---|
| `package.json` | D1 | Added `"tsx": "^4.21.0"` to devDependencies (npm installed successfully) |
| `vercel.json` | D4 | Added `headers` array with 4 security headers on all routes + Cache-Control on static assets; preserved existing `functions.maxDuration: 60` |

---

## Notes

### D2 — OG Banner

`public/og-banner.png` was created programmatically using Node.js built-in `zlib` (no external tools needed). It is a valid PNG at 1200×630px with a solid zinc (#18181b) background. The SVG version at `public/og-banner.svg` contains branded text ("Omni Incubator" + tagline) and can be used to regenerate a higher-quality PNG via any image editor before launch.

### D3 — RLS Script

The script uses two queries:
1. `pg_policies` for policy counts per table
2. `pg_tables` for RLS enabled/disabled status

If `pg_tables` is not accessible via the Supabase REST API, the script falls back to policy-count-only reporting with a warning. Exits with code `1` if env vars are missing or DANGER conditions exist.

Run via:
```bash
SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/verify-rls.ts
```

tsx installed and verified: `tsx v4.21.0`, Node.js v25.6.1.

---

## Build Check

`npm run build` is **NOT run** at this stage. Frontend agent performs the combined build check after completing all frontend tasks.

---

## Spec Deviations

None. All tasks D1–D6 and B1–B2 implemented as specified.
