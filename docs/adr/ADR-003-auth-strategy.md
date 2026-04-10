# ADR-003: Auth Strategy — Email OTP and Google OAuth

## Status: Accepted

## Context

The application needs user authentication. Options considered:

1. **Magic links (email)** — Supabase's default email auth. Sends a one-click sign-in URL. Works, but users frequently experience issues with link expiry, email clients pre-fetching and invalidating the link, and link-stripping by corporate proxies.
2. **Email OTP (one-time password)** — Sends a 6-digit code the user types in. More robust against the link-stripping and pre-fetch problems of magic links.
3. **Password-based auth** — Requires password reset flows, secure storage, and adds UX friction. Not aligned with the target audience (casual consumers).
4. **Google OAuth** — Broad adoption, low friction for users with a Google account. Required for users who prefer social login. Does not require email confirmation step.
5. **Other OAuth providers** (Apple, Facebook, GitHub) — Considered out of scope for Phase 1.

## Decision

Implement **Email OTP** as the primary auth method and **Google OAuth** as a secondary option. Magic links are explicitly disabled in the Supabase Auth settings.

**Email OTP flow:**
1. User enters email on `/login`.
2. Client calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
3. Supabase sends a 6-digit code to the email address.
4. UI transitions (without page reload) to a code input step.
5. User enters code; client calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
6. On success, user is redirected to the `next` param or `/library`.
7. Resend link is available if the code expires (10-minute window).

**Google OAuth flow:**
1. User clicks "Sign in with Google" on `/login`.
2. Client calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '/api/auth/callback' } })`.
3. Google redirects to the Supabase Auth server, which redirects to `/api/auth/callback`.
4. The callback route exchanges the PKCE code for a session (`exchangeCodeForSession`), then redirects to `/library` or `next` param.

**Session management:**
- Sessions are managed by `@supabase/ssr` via HTTP-only cookies.
- `src/middleware.ts` refreshes the session on every request, ensuring server components always have a valid session to read.

**New user handling:**
- `shouldCreateUser: true` on OTP means new users are auto-created on first sign-in.
- A Postgres trigger (`on_auth_user_created`) fires on `auth.users` INSERT and creates a corresponding `profiles` row with a derived `display_name` and `username`.

## Consequences

**Enables:**
- No passwords to manage, reset, or breach.
- Google OAuth covers users who want frictionless sign-in.
- The two-step OTP UI avoids the magic link pre-fetch problem.
- Session refresh in middleware means server components never serve stale auth state.

**Makes harder:**
- Google OAuth requires an external task: creating a Google Cloud OAuth 2.0 client ID (see External Task E3 in the runbook).
- OTP requires a valid transactional email configuration in Supabase (Supabase's built-in SMTP is rate-limited to 3 emails/hour per email address; production should use a custom SMTP provider like Resend).
- No Apple/GitHub/Facebook OAuth in Phase 1 — can be added in a future phase without schema changes.
