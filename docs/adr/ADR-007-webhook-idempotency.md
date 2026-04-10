# ADR-007: Webhook Idempotency via Postgres RPC

## Status: Accepted

## Context

Stripe guarantees at-least-once delivery: any webhook event may be delivered more than once (retries on non-2xx responses, network issues, or Stripe's own retry policy). The Phase 3 webhook handler performs DB writes (INSERT orders, UPSERT subscriptions, INSERT user_ebooks) and external side effects (Resend email, Beehiiv subscribe). Without an idempotency guard, a duplicate event delivery would create duplicate orders and send duplicate emails.

Three approaches were considered:

1. **Application-level check before each handler** — query an `processed_events` table at the top of each event case, check if already processed, and skip if so. Simple but requires the check to be inside the handler lock to avoid a TOCTOU race under concurrent delivery of the same event.

2. **Postgres RPC with `INSERT ... ON CONFLICT DO NOTHING RETURNING`** — an atomic `claim_stripe_event(event_id, event_type)` function that inserts a row and returns it only if the insert succeeded. The RPC is called once before any handler logic. If nothing is returned, the event was already processed; return 200 immediately.

3. **Stripe idempotency keys on outbound calls** — pass Stripe event IDs as idempotency keys when creating DB records. Does not prevent duplicate external effects (email, Beehiiv) and is Stripe-specific.

## Decision

Use the **Postgres RPC approach**: `claim_stripe_event(p_event_id, p_event_type)` defined in `supabase/migrations/20240101000015_claim_stripe_event_fn.sql`.

```sql
-- Called at the start of every webhook request, after signature verification.
-- Returns the event_id row if claimed (first delivery), empty set if already processed.
INSERT INTO public.processed_stripe_events (event_id, event_type, processed_at)
VALUES (p_event_id, p_event_type, now())
ON CONFLICT (event_id) DO NOTHING
RETURNING public.processed_stripe_events.event_id;
```

In the route handler (`src/app/api/webhooks/stripe/route.ts`):

```typescript
const { data: claimed } = await adminClient.rpc('claim_stripe_event', {
  p_event_id: event.id,
  p_event_type: event.type,
})
if (!claimed || claimed.length === 0) {
  return NextResponse.json({ received: true }, { status: 200 })
}
// proceed with handler logic
```

## Consequences

**Enables:**
- Atomicity: the RPC claim and the RETURNING check are a single round-trip. No TOCTOU window between check and insert.
- Any duplicate delivery is short-circuited before any DB write or external API call, preventing duplicate orders, emails, or Beehiiv subscriptions.
- `processed_stripe_events` table provides an audit log of all processed events (event_id, event_type, processed_at).
- Works correctly under concurrent requests: Postgres `ON CONFLICT DO NOTHING` ensures only one concurrent claim succeeds.

**Makes harder:**
- Event reprocessing for debugging requires deleting the row from `processed_stripe_events` manually.
- `processed_stripe_events` table will grow unboundedly; a periodic purge job (e.g., delete rows older than 90 days) is advisable in Phase 6 or later.
- The RPC adds one extra DB round-trip to every webhook request (before signature verification side effects are processed).
