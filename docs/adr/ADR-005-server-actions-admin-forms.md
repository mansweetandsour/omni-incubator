# ADR-005: Server Actions for Admin Forms

## Status: Accepted

## Context

Phase 2 added admin CRUD for products and services. Each form requires auth, DB writes, and optional side effects (Stripe sync). The two implementation patterns considered were:

1. **API routes** (`/api/admin/products`, `/api/admin/services`) — REST endpoints consuming JSON, returning JSON, called via `fetch` from client components.
2. **Next.js Server Actions** (`'use server'` functions in `src/app/actions/`) — functions that run on the server and are called directly from form `action=` attributes or from client component event handlers.

## Decision

Use **Next.js Server Actions** for all admin form mutations (create, update, archive) on products and services.

- `src/app/actions/products.ts` — `createProduct`, `updateProduct`, `archiveProduct`
- `src/app/actions/services.ts` — `createService`, `updateService`, `archiveService`

API routes are reserved for operations that require non-form access patterns: file upload (`/api/admin/ebooks/[id]/upload`), public paginated listings (`/api/library/products`), and public preview redirects (`/api/ebooks/[id]/preview`).

## Consequences

**Enables:**
- No serialization layer: `FormData` is passed directly; the action reads typed fields. No JSON body shaping on the client.
- Auth is enforced inside the action via `getAdminUser()`, which reads the cookie-based session. No separate auth middleware per route.
- Progressive enhancement: forms work without JavaScript (plain `<form action={action}>`).
- Type safety end-to-end: return types are TypeScript discriminated unions (`{ id, slug } | { error }`) checked at the call site.
- Fire-and-forget side effects (Stripe sync) are trivially attached with `.catch(console.error)` inside the action.

**Makes harder:**
- Server Actions cannot be called from outside the Next.js app (no external API consumer). File upload remained as an API route because multipart/form-data upload from file input widgets is simpler via a dedicated route that streams to Supabase Storage.
- Testing Server Actions in isolation requires a full Next.js test harness or mocking `'use server'` boundaries.
- Actions are not separately versioned or documented in an OpenAPI spec.
