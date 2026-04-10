# ADR-006: Lazy Stripe Singleton with Null Guard

## Status: Accepted

## Context

Phase 2 introduced `src/lib/stripe.ts` to sync e-book products to Stripe on create/update. The Stripe SDK must be initialized with a secret key (`STRIPE_SECRET_KEY`). During local development and CI builds this key is typically absent. The two initialization approaches considered were:

1. **Eager singleton** — `const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {...})` at module top-level. Simple, but throws at module evaluation time when the key is absent, breaking any import of the module and crashing the build.
2. **Lazy singleton with null guard** — A private `_stripe` variable initialized to `null`. A `getStripe()` function checks for the key, returns `null` if absent, and constructs + caches the singleton on first call if present.

## Decision

Use the **lazy singleton with null guard** pattern.

```typescript
let _stripe: Stripe | null = null

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-03-25.dahlia',
    })
  }
  return _stripe
}
```

Every exported function that needs Stripe calls `getStripe()` first and early-returns if the result is `null`:

```typescript
export async function syncStripeProduct(productId: string): Promise<void> {
  const stripe = getStripe()
  if (!stripe) return
  // ...
}
```

The Stripe sync functions are called fire-and-forget from Server Actions:

```typescript
syncStripeProduct(product.id).catch(console.error)
```

## Consequences

**Enables:**
- Build and TypeScript check pass without `STRIPE_SECRET_KEY` in the environment.
- No special mocking needed in CI for the Stripe module.
- Product creation succeeds in development; Stripe columns remain `null` and are populated when the key is added.
- Idempotency guard in `syncStripeProduct` prevents duplicate Stripe products if the function is called multiple times.

**Makes harder:**
- Stripe sync failures in production are silent (fire-and-forget with `console.error`). A missing or incorrect key will not surface as a user-visible error. Phase 3 will need to add admin visibility into sync status.
- The singleton is process-scoped. In serverless environments (Vercel), each cold start creates a new instance, which is correct behavior but means the cache benefit only applies within a warm function execution.
