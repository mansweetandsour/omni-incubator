# ADR-008: Stripe v22 API Adaptation

## Status: Accepted

## Context

The Phase 3 SPEC was written against an older Stripe SDK API shape. The installed package is `stripe@22.0.1` (API version `2026-03-25.dahlia`). Stripe v22 moved several fields that are heavily used in the webhook handler:

| SPEC reference | Actual location in stripe@22 |
|---|---|
| `sub.current_period_start` | `sub.items.data[0].current_period_start` |
| `sub.current_period_end` | `sub.items.data[0].current_period_end` |
| `invoice.subscription` | `invoice.parent.subscription_details.subscription` |
| `line.type === 'invoiceitem'` | `line.parent.type === 'invoice_item_details'` |

Accessing the SPEC-described paths at runtime would return `undefined`, causing silent data corruption (null values written to subscriptions table) or incorrect proration detection.

## Decision

Add three private helper functions in `src/app/api/webhooks/stripe/route.ts` that centralize the v22 field access so the handler body reads the SPEC-described logical fields without repeating the nested path everywhere:

```typescript
// Extract current_period_start / current_period_end from first subscription item
function getSubPeriod(sub: Stripe.Subscription): { start: number; end: number } {
  const item = sub.items.data[0]
  return {
    start: item.current_period_start,
    end: item.current_period_end,
  }
}

// Extract subscription ID from invoice (v22 nested parent structure)
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (
    (invoice.parent as any)?.subscription_details?.subscription ?? null
  ) as string | null
}

// True when all invoice lines are proration items (v22 parent.type check)
function isAllProration(invoice: Stripe.Invoice): boolean {
  return invoice.lines.data.every(
    (line) => (line.parent as any)?.type === 'invoice_item_details'
  )
}
```

These helpers are called wherever the handler previously referenced the flat SPEC fields.

## Consequences

**Enables:**
- Correct period date storage in `subscriptions.current_period_start/end`.
- Correct subscription ID extraction for `invoice.paid` and `invoice.payment_failed` handlers.
- Correct proration detection in `invoice.paid` (avoids spurious renewal order inserts for mid-cycle plan changes).
- The deviation is contained in three named functions — easy to find and update if Stripe moves fields again in a future major version.

**Makes harder:**
- The `as any` casts in `getInvoiceSubscriptionId` and `isAllProration` suppress TypeScript type checking for those paths. If Stripe changes the structure again without a major version bump, the failure will be a runtime `undefined` rather than a compile-time error.
- Future developers reading the handler need to be aware that `getSubPeriod` / `getInvoiceSubscriptionId` exist and should be used rather than accessing the SDK types directly.
- When upgrading the `stripe` npm package, these helpers must be audited against the Stripe changelog before deploying.
