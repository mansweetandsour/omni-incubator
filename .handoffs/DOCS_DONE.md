# DOCS_DONE.md — Phase 3: Billing
**Docs Agent Output**
**Date:** 2026-04-09
**Phase:** 3 — Billing
**Overall result: PASS**

---

## Files Updated

| File | Change |
|---|---|
| `README.md` | Added Phase 3 to "What's Been Built"; updated Project Structure to include all new API routes, pages, components (`billing/`), lib files (`membership.ts`, `beehiiv.ts`, `email.tsx`, `coupon.ts`), `emails/` directory, and `vercel.json`; updated Key Documentation links to include ADR-007, ADR-008, and the webhook setup runbook |
| `docs/api-reference.md` | Added all Phase 3 API endpoints: `POST /api/checkout/membership`, `POST /api/checkout/ebook`, `POST /api/checkout/ebook-with-membership`, `POST /api/coupons/validate`, `POST /api/webhooks/stripe`, `GET /api/profile/orders`, `GET /api/profile/ebooks`, `GET /api/profile/subscription`, `GET /api/ebooks/[id]/download`, `POST /api/subscription/portal` |
| `docs/runbooks/runbook-external-tasks.md` | Updated E8 (Beehiiv), E9 (Resend), E18 (Resend domain) blocking status to "needed before Phase 4A" with explanation of what is silently skipped without each key |

---

## ADRs Created

| Title | Path |
|---|---|
| ADR-007: Webhook Idempotency via Postgres RPC | `docs/adr/ADR-007-webhook-idempotency.md` |
| ADR-008: Stripe v22 API Adaptation | `docs/adr/ADR-008-stripe-v22-adaptation.md` |

---

## Runbooks Created

| Title | Path |
|---|---|
| Stripe Webhook Setup | `docs/runbooks/stripe-webhook-setup.md` |

Covers: configuring the Stripe webhook endpoint (E6), selecting the 7 required events, adding the signing secret to environment, verifying via Stripe Dashboard test events, using Vercel logs as an alternative to Stripe CLI (which is not installed locally), local testing instructions for when CLI is available, idempotency reprocessing procedure, and a troubleshooting table.

---

## Documentation Debt Flagged

1. **`processed_stripe_events` table purge** — ADR-007 notes that this table grows unboundedly. A purge runbook or scheduled Supabase cron (delete rows older than 90 days) should be added in Phase 6 or as a standalone maintenance task.
2. **Stripe live mode cutover** — E13 in `runbook-external-tasks.md` covers switching to live mode, but there is no runbook for step-by-step verification (confirm live-mode webhook signing secret, live-mode price IDs, smoke test a real checkout end-to-end). Consider adding before Phase 6 launch.
3. **`email_log` table** — `sendEmail` logs all attempts to `email_log`. No runbook or admin UI exists for inspecting delivery failures or resending failed emails. Flag for Phase 4A or 5.
