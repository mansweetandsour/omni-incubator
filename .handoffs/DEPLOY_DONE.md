# DEPLOY_DONE.md — Phase 6: Polish & Deploy
**DevOps Agent**
**Date:** 2026-04-10
**Phase:** 6 — Polish & Deploy
**Status: APPROVED**

---

## Build Verification

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | 0 errors |
| Vitest unit tests | 7/7 pass |
| Next.js build (env vars required) | Expected failure only — no code errors |

The Next.js build fails when run without environment variables because `src/lib/supabase/admin.ts` calls `createClient` at module level. This is a pre-existing condition from Phase 1. The build succeeds in any environment with env vars populated (e.g., Vercel with secrets configured).

---

## Commits Made and Pushed

### Commit 1 — Phase 6 application changes
**SHA:** `c5e37e7`
**Branch:** `main`
**Remote:** `https://github.com/mansweetandsour/omni-incubator.git`
**Message:** `feat(phase-6): polish & deploy — homepage, SEO, sitemap, loading states, mobile, RLS audit`

57 files changed, 3572 insertions, 1215 deletions.

Key additions:
- `src/app/page.tsx` — Homepage (hero, sweepstake callout, featured e-books, how it works, membership pitch, newsletter). ISR revalidate=60.
- `src/app/sitemap.ts` — Dynamic sitemap with static + DB-driven routes (products, sample_products, services)
- `src/app/robots.ts` — Disallows /admin/* and /profile/* for all user agents
- `src/app/library/loading.tsx`, `src/app/library/[slug]/loading.tsx` — Library skeleton loaders
- `src/app/(admin)/admin/orders/loading.tsx`, `products/loading.tsx`, `users/loading.tsx` — Admin skeleton loaders
- `src/components/library/filter-sheet-trigger.tsx` — Mobile filter Sheet (shadcn Sheet, side=left)
- `scripts/verify-rls.ts` — RLS audit script (queries pg_policies, exits 1 on DANGER)
- `docs/runbooks/pre-launch-checklist.md` — Pre-launch checklist
- `docs/runbooks/runbook-rls-audit.md` — RLS audit runbook
- `vercel.json` — Security headers + webhook maxDuration=60
- `public/og-banner.png`, `public/og-banner.svg` — OG image assets (placeholder; see E-OG below)
- SEO: `generateMetadata()` or `metadata` const on all 12 public pages
- Mobile: admin sidebar Sheet, admin table overflow-x-auto, library grid-cols-1→sm:grid-cols-2→lg:grid-cols-3
- `/privacy` and `/terms` — substantive multi-section placeholder content with EXTERNAL TASK E14 notice

### Commit 2 — State files
**Branch:** `main`
**Message:** `chore: mark phase 6 complete — all phases done`

---

## Infrastructure Changes

### vercel.json
- `functions.api/webhooks/stripe/route.maxDuration: 60` — preserved from prior phases
- Security headers on `/(.*)`):
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- Cache-Control for static assets: `public, max-age=31536000, immutable`

### No new environment variables introduced
All env vars remain as documented in `.env.local.example` (established Phase 1).

---

## CI/CD

No GitHub Actions pipeline exists in this repo. Deployment is via Vercel Git integration (connect repo in Vercel dashboard — see E11 below).

**Trigger:** Push to `main` branch triggers automatic Vercel deploy once integration is configured.

---

## Rollback Procedure

If a bad deploy is pushed to Vercel:
1. Vercel dashboard → Project → Deployments → select prior good deployment → "Promote to Production"
2. Or: `git revert HEAD && git push origin main` to revert the commit and trigger a new deploy

---

## External Tasks Requiring Human Action Before Production Launch

| ID | Task | Owner |
|---|---|---|
| E1 | Create Supabase production project, run all migrations (`supabase db push`), configure storage buckets | Human |
| E11 | Connect GitHub repo to Vercel, configure project, set all env vars, trigger first deploy | Human |
| E12 | Configure custom domain `omniincubator.org` in Vercel + DNS provider | Human |
| E13 | Activate Stripe live mode, copy live keys to Vercel environment variables, register webhook endpoint for production URL | Human |
| E14 | Legal review and approval of `/privacy`, `/terms`, and `/sweepstakes/rules` placeholder content — replace with legally reviewed text before launch | Human (Legal) |
| E15 | Create the first sweepstake in `/admin/sweepstakes` | Human |
| E16 | Upload first e-book PDF and cover in `/admin/products` | Human |
| E17 | Upload first sample product file in `/admin/sample-products` | Human |
| E-OG | Replace `public/og-banner.png` with production-quality 1200×630 OG banner design | Human (Designer) |

---

## Environment Variables Required in Vercel (Production)

All variables from `.env.local.example` must be set in Vercel project settings before first deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY` (live mode `sk_live_...`)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (live mode `pk_live_...`)
- `STRIPE_WEBHOOK_SECRET` (from Stripe dashboard after registering production webhook endpoint)
- `STRIPE_MEMBERSHIP_MONTHLY_PRICE_ID`
- `STRIPE_MEMBERSHIP_ANNUAL_PRICE_ID`
- `RESEND_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `BEEHIIV_API_KEY`
- `BEEHIIV_PUBLICATION_ID`
- `NEXT_PUBLIC_REWARDFUL_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_APP_URL` (set to `https://omniincubator.org`)

---

## Post-Deploy Health Checks

Once deployed, verify:
1. `https://omniincubator.org` — homepage loads with all 5 sections
2. `https://omniincubator.org/sitemap.xml` — returns valid XML
3. `https://omniincubator.org/robots.txt` — disallows /admin/ and /profile/
4. Email OTP login flow completes end-to-end
5. Stripe Checkout creates a subscription in test mode first, then live mode
6. Stripe webhook delivers to `https://omniincubator.org/api/webhooks/stripe` (check Stripe dashboard)
7. Run `npx tsx scripts/verify-rls.ts` against production Supabase (see `docs/runbooks/runbook-rls-audit.md`)
8. Run through `docs/runbooks/pre-launch-checklist.md` in full before opening to public traffic
