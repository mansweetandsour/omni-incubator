# ADR-001: Three Supabase Client Variants

## Status: Accepted

## Context

The application runs in three distinct execution environments — the browser, Node.js server components/route handlers, and the Vercel Edge runtime (middleware). Each environment has different capabilities for reading and writing cookies, and different levels of trust. A single universal Supabase client cannot satisfy all three contexts:

- The browser can read and write `document.cookie` directly.
- Server components and route handlers access cookies via Next.js `cookies()` from `next/headers`.
- Middleware runs on the Edge and needs to both read and write cookies to refresh session tokens on every request.
- Some operations (webhook handlers, admin actions) must bypass Row Level Security entirely.

Using the wrong client in a given context either breaks session management or creates a security hole (e.g., using the service role client in a component reachable by user-controlled code).

## Decision

Three separate client modules are maintained under `src/lib/supabase/`:

| File | Client type | Environment | RLS |
|---|---|---|---|
| `client.ts` | `createBrowserClient` from `@supabase/ssr` | Browser only | Enforced |
| `server.ts` | `createServerClient` from `@supabase/ssr` | Server components, route handlers, middleware | Enforced |
| `admin.ts` | `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` | Server only — webhook handlers, admin operations | Bypassed |

Rules enforced by convention:
- `admin.ts` must never be imported in any file under `src/components/` or `src/app/` (except route handlers that explicitly require service-level access).
- `client.ts` must never be imported in server components or route handlers.
- `server.ts` is the default for all server-side Supabase access.

## Consequences

**Enables:**
- Correct cookie handling in all Next.js App Router contexts.
- The session refresh middleware works without a separate cookie library.
- Service role operations are isolated to a small set of known files, making security review easier.

**Makes harder:**
- Developers must consciously choose which client to import. An incorrect import will compile without error but fail at runtime (e.g., browser client used in a server component throws because `document` is undefined).
- The `admin.ts` client must be guarded with `server-only` import or careful code review to prevent accidental client-bundle inclusion (current implementation relies on convention; a `server-only` import guard can be added as a future hardening step).
