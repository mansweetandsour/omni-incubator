# ADR-010: Lead Capture Email Confirmation Flow

## Status: Accepted

## Context

Lead capture is a public, unauthenticated endpoint (`POST /api/lead-capture`). Any visitor can submit an email address. Sweepstake entries have real value to the business — they determine contest eligibility — so entry awarding must be resistant to abuse.

Two approaches were considered:

**Option A — Award entries immediately on form submit:** The lead capture row is created and `awardLeadCaptureEntries()` is called at the point of form submission. No email confirmation step.

**Option B — Award entries only after email confirmation (chosen):** `POST /api/lead-capture` creates a `lead_captures` row with `confirmed_at=NULL` and `entry_awarded=false`, and sends a confirmation email containing a single-use token. `POST /api/lead-capture/confirm` validates the token (72-hour TTL), sets `confirmed_at`, sets `entry_awarded=true`, and then calls `awardLeadCaptureEntries()`.

## Decision

Award entries only after email confirmation (Option B). No sweepstake entries are written to `sweepstake_entries` until the token in the confirmation email is validated.

Specific constraints:
- Confirmation tokens are `crypto.randomUUID()` values stored in `lead_captures.confirmation_token`.
- Tokens expire 72 hours after `confirmation_sent_at`.
- Resend enforces a 5-minute cooldown: the resend route returns 429 if `confirmation_sent_at > NOW() - 5 minutes`. A DB-level guard enforces this even if the Upstash rate limiter is not configured.
- A second submit for the same `(email, sweepstake_id)` pair returns `{ duplicate: true }` without creating a new row or sending a new email.

## Consequences

**Enables:**
- Abuse prevention: an attacker cannot flood the sweepstake with fake entries by submitting invented email addresses. Each entry requires a click from a real inbox.
- Real email validation: entries correspond to addresses the submitter actually controls and can receive mail at.
- Clean `sweepstake_entries` data: all rows in the entries table represent confirmed, de-duplicated participants.

**Makes harder:**
- Conversion friction: a user must check their email and click a link before receiving their entries. This adds one step compared to instant-entry flows.
- Email deliverability dependency: if the Resend domain (`RESEND_FROM_EMAIL`) is not verified or the confirmation email is filtered to spam, the user cannot complete entry. This is mitigated by a resend option on the confirmation page and the expired-token re-entry form at `/confirm/[token]` for the 410 state.
- 72-hour window means entries from a given submission are not finalized until confirmation occurs. Analytics showing "lead captures" and "entries awarded" will differ until the confirmation step completes.
