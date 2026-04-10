# Runbook: Stripe Webhook Setup (E6)

This runbook covers configuring the Stripe webhook endpoint for production and verifying it works correctly. It corresponds to external task E6 in [runbook-external-tasks.md](runbook-external-tasks.md).

---

## Prerequisites

- Stripe account created and test-mode API keys added to environment (E4 complete)
- App deployed to Vercel (or accessible via a public URL for testing)

---

## Step 1: Configure the webhook endpoint in Stripe Dashboard

1. Go to [Stripe Dashboard](https://dashboard.stripe.com) → Developers → Webhooks.
2. Click **Add endpoint**.
3. Set the endpoint URL:
   - **Production:** `https://omniincubator.org/api/webhooks/stripe`
   - **Test/staging:** your Vercel preview URL + `/api/webhooks/stripe`
4. Under **Select events to listen to**, add the following events:

   | Event |
   |---|
   | `checkout.session.completed` |
   | `customer.subscription.created` |
   | `customer.subscription.updated` |
   | `customer.subscription.deleted` |
   | `customer.subscription.trial_will_end` |
   | `invoice.paid` |
   | `invoice.payment_failed` |

5. Click **Add endpoint**.
6. On the endpoint detail page, click **Reveal** next to **Signing secret**.
7. Copy the `whsec_...` value.
8. Add it to your environment:
   - **Local:** `.env.local` → `STRIPE_WEBHOOK_SECRET=whsec_...`
   - **Vercel:** Dashboard → Settings → Environment Variables → `STRIPE_WEBHOOK_SECRET`

---

## Step 2: Verify the webhook endpoint is active

After deployment, send a test event from the Stripe Dashboard:

1. Go to the endpoint detail page in Stripe Dashboard.
2. Click **Send test event**.
3. Choose any event type (e.g., `customer.subscription.created`).
4. Click **Send test event**.
5. Check the response — it should be `200 { "received": true }`.

If the response is `400`:
- Confirm `STRIPE_WEBHOOK_SECRET` is set in the environment and matches the signing secret shown on the endpoint detail page.
- Confirm the deployment is using the latest code (the webhook route must be present).

---

## Step 3: Verify events are being processed (Vercel Logs)

The Stripe CLI (`stripe listen`) is the preferred local testing tool, but it is not installed in this development environment. Use Vercel logs as an alternative:

1. In [Vercel Dashboard](https://vercel.com/dashboard) → your project → **Logs**.
2. Filter by Function: `api/webhooks/stripe`.
3. Trigger a checkout in the app (or send a test event from Stripe Dashboard).
4. Confirm log lines appear showing the event type and `{ received: true }` response.

For more detailed inspection:
- Stripe Dashboard → Developers → Webhooks → your endpoint → **Webhook attempts** tab shows each delivery attempt with request/response bodies and response codes.

---

## Step 4: Local testing with Stripe CLI (when available)

If the Stripe CLI is installed locally:

```bash
# Forward Stripe events to local dev server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# The CLI will print a webhook signing secret (whsec_...) — copy it to .env.local
# STRIPE_WEBHOOK_SECRET=whsec_...  (use the value printed by the CLI, not the Dashboard secret)

# Trigger a specific event to test
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```

Note: The CLI signing secret is different from the Dashboard signing secret. Use the CLI secret only in `.env.local` when running `stripe listen`. Use the Dashboard secret for deployed environments.

---

## Idempotency and duplicate events

The webhook handler is idempotent: duplicate deliveries of the same event ID are detected and discarded before any DB write or external API call. This is enforced by the `claim_stripe_event` Postgres RPC (see [ADR-007](../adr/ADR-007-webhook-idempotency.md)).

If you need to reprocess an event (e.g., for debugging):
1. Connect to Supabase (Dashboard → SQL Editor or via `supabase db ...`).
2. Delete the row from `processed_stripe_events` where `event_id = 'evt_...'`.
3. Resend the event from Stripe Dashboard → Webhooks → endpoint → Webhook attempts → **Resend**.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `400 Invalid signature` | Wrong `STRIPE_WEBHOOK_SECRET` in env | Confirm the value matches the signing secret on the Stripe endpoint detail page |
| `400 Invalid signature` on CLI | Using Dashboard secret with CLI forwarding | Use the secret printed by `stripe listen`, not the Dashboard secret |
| `200` but no DB rows created | Event already processed (idempotency) | Check `processed_stripe_events` table; delete row to reprocess |
| `500` on webhook | Missing `STRIPE_WEBHOOK_SECRET` entirely | The handler returns 400 when secret is absent — check env var is set |
| Subscription not found on `invoice.paid` | Race: `invoice.paid` arrived before `customer.subscription.created` | This is handled: handler logs a warning and returns 200. The `subscription.created` event will create the row. No action needed. |

---

## Related

- [External Tasks Checklist](runbook-external-tasks.md) — E4, E5, E6, E7
- [ADR-007: Webhook idempotency via Postgres RPC](../adr/ADR-007-webhook-idempotency.md)
- [ADR-008: Stripe v22 API adaptation](../adr/ADR-008-stripe-v22-adaptation.md)
- [API Reference — Webhooks](../api-reference.md)
