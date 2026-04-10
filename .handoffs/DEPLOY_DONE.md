# DEPLOY_DONE.md — Phase 3: Billing

**Result: APPROVED**
**Date:** 2026-04-09
**Phase:** 3 — Billing

---

## Summary

Phase 3 is build-clean and infra-ready. All 7 new environment variables are documented in `.env.local.example`. No hardcoded secrets found. `vercel.json` correctly extends the webhook function timeout. The webhook route uses `request.text()` for raw body access, which is correct for Stripe signature verification — no body parser override is needed in Next.js App Router. Three external tasks (E4, E6, E9/E18) are blocking for Phase 4A.

---

## Task Results

### Task 1 — Build Clean Verification

**PASS — Confirmed by QA**

QA Agent confirmed:

```
NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
SUPABASE_SERVICE_ROLE_KEY=dummy \
NEXT_PUBLIC_SITE_URL=https://omniincubator.org \
node node_modules/next/dist/bin/next build

→ ✓ Compiled successfully in 5.8s
→ 34 routes compiled (all dynamic)
→ EXIT_CODE: 0
```

`npx tsc --noEmit` → 0 errors. QA is the authoritative source; no re-run required.

---

### Task 2 — `vercel.json` maxDuration Verification

**PASS**

`vercel.json` exists at project root with:

```json
{
  "functions": {
    "src/app/api/webhooks/stripe/route.ts": {
      "maxDuration": 60
    }
  }
}
```

This extends the Stripe webhook handler timeout to 60 seconds (Vercel Pro default is 60s; this makes it explicit and ensures the setting survives if the plan changes). All other routes use the default 10s timeout. No changes required.

---

### Task 3 — `.env.local.example` Coverage

**PASS — All Phase 3 vars documented**

`.env.local.example` contains all 7 new Phase 3 environment variables with inline comments:

| Variable | Guard behavior | Present in .env.local.example |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Hard fail — webhook returns 400 if absent | Yes |
| `STRIPE_MONTHLY_PRICE_ID` | Hard fail — checkout/membership 500s if absent | Yes |
| `STRIPE_ANNUAL_PRICE_ID` | Hard fail — checkout/membership 500s if absent | Yes |
| `RESEND_API_KEY` | Non-blocking — email skipped + warning logged | Yes |
| `RESEND_FROM_EMAIL` | Optional — defaults to `noreply@omniincubator.org` | Yes |
| `BEEHIIV_API_KEY` | Non-blocking — Beehiiv calls skipped + warning logged | Yes |
| `BEEHIIV_PUBLICATION_ID` | Non-blocking — Beehiiv calls skipped + warning logged | Yes |

Note: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are also present in `.env.local.example` in anticipation of Phase 4A rate limiting. These are not used in Phase 3 code.

---

### Task 4 — Hardcoded Secrets Audit

**PASS — No hardcoded secrets found**

Scanned `src/` for:
- Stripe key prefixes: `sk_live_`, `sk_test_`, `pk_live_`, `pk_test_`, `whsec_`
- Resend key prefix: `re_` (with significant suffix length)
- Generic inline patterns

**Result: 0 matches.**

All secrets accessed exclusively via `process.env.*`. No values inlined in source.

---

### Task 5 — Webhook Raw Body Verification

**PASS — No body parser interference**

File: `src/app/api/webhooks/stripe/route.ts` line 72:
```typescript
const rawBody = await request.text()
```

The route reads the request body as raw text before passing it to `stripe.webhooks.constructEvent(Buffer.from(rawBody), sig, STRIPE_WEBHOOK_SECRET)`. This is the correct approach for Stripe signature verification.

**Why no middleware configuration is needed:** Next.js App Router Route Handlers do not have a global body parser (unlike the Pages Router's `bodyParser` config). The `Request` object received by the route handler contains the raw stream. `request.text()` reads it directly without transformation. No `export const config = { api: { bodyParser: false } }` override is required or applicable in the App Router.

No middleware in `src/middleware.ts` or elsewhere intercepts or transforms request bodies. Confirmed: the webhook route is correct as implemented.

---

### Task 6 — New Migrations

**NOTED**

Two new migrations were added in Phase 3:

| File | Purpose |
|---|---|
| `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` | `claim_stripe_event` RPC for idempotent webhook processing |
| `supabase/migrations/20240101000016_increment_download_count_fn.sql` | `increment_download_count` RPC for atomic download counter |

Total migrations: 16. These must be applied to the production Supabase project via `supabase db push` before Phase 3 code is deployed.

---

## New Environment Variables (Phase 3)

| Variable | Required | Source |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | Yes — hard fail | Stripe Dashboard → Developers → Webhooks → endpoint signing secret |
| `STRIPE_MONTHLY_PRICE_ID` | Yes — hard fail | Stripe Dashboard → Products → price ID |
| `STRIPE_ANNUAL_PRICE_ID` | Yes — hard fail | Stripe Dashboard → Products → price ID |
| `RESEND_API_KEY` | No — non-blocking | Resend Dashboard → API Keys |
| `RESEND_FROM_EMAIL` | No — optional | Configured verified sender address |
| `BEEHIIV_API_KEY` | No — non-blocking | Beehiiv Dashboard → Settings → Integrations → API |
| `BEEHIIV_PUBLICATION_ID` | No — non-blocking | Beehiiv Dashboard → publication ID |

Add all variables to Vercel Dashboard → Settings → Environment Variables before promoting Phase 3 to production.

---

## Infrastructure Resources Created or Modified

| Resource | Type | Change |
|---|---|---|
| `vercel.json` | Vercel config | Created — sets `maxDuration: 60` for webhook route |
| `supabase/migrations/20240101000015_claim_stripe_event_fn.sql` | Postgres RPC + table | New — `processed_stripe_events` table + `claim_stripe_event` function |
| `supabase/migrations/20240101000016_increment_download_count_fn.sql` | Postgres RPC | New — `increment_download_count` function |

No new Supabase Storage buckets, no new cloud services, no Docker/compose changes required.

---

## Staging / Production URLs

| Environment | URL |
|---|---|
| Production | `https://omniincubator.org` (pending E11 — Vercel setup) |
| Local dev | `http://localhost:3000` |

---

## CI/CD Pipeline

No changes. Deployment is via Vercel git integration (push to `main` triggers build + deploy). The only new deployment artifact is `vercel.json` which Vercel reads automatically on next deployment.

---

## Rollback Procedure

1. In Vercel Dashboard → project → **Deployments** tab
2. Locate the previous known-good deployment
3. Click three-dot menu → **Promote to Production**
4. Traffic is instantly re-routed — no rebuild required

**Database rollback note:** Phase 3 includes 2 new migrations. Rolling back application code while leaving the migrations applied is safe — the new tables/functions are additive and the old code does not reference them. If a full DB rollback is needed, run:
```sql
DROP FUNCTION IF EXISTS public.claim_stripe_event(text, text);
DROP TABLE IF EXISTS public.processed_stripe_events;
DROP FUNCTION IF EXISTS public.increment_download_count(uuid, uuid);
```
Only do this if application code is also being rolled back.

---

## External Tasks Blocking Phase 4A

| Task | Description | Consequence if missing |
|---|---|---|
| **E4** | Stripe test-mode API keys in production env | Checkout sessions cannot be created; webhooks return 400 |
| **E6** | Stripe webhook endpoint configured in Stripe Dashboard | No webhook events delivered; orders/subscriptions not created |
| **E9/E18** | Resend account + domain verified | All transactional emails (purchase receipts, membership welcome, trial ending, payment failed) silently skipped; Phase 4A lead capture confirmation emails will not deliver |
| **E8** | Beehiiv account + API keys | New members not subscribed to newsletter; cancellations not unsubscribed |

E4 and E6 are hard-blocking for any billing functionality. E8, E9/E18 are soft-blocking but must be resolved before Phase 4A launch.
