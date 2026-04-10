# DOCS_DONE.md — Phase 2: Products & Library

**Overall result: PASS**

**Date:** 2026-04-09
**Phase:** 2 of 6

---

## Files Updated

| File | Change |
|---|---|
| `README.md` | Added "What's Been Built" section covering Phase 1 and Phase 2 (admin CRUD, Stripe sync, file upload, library, e-book detail, marketplace). Expanded Project Structure tree to reflect all new files and directories from Phase 2. Added ADR-005, ADR-006, and API reference to Key Documentation list. |
| `docs/runbooks/runbook-external-tasks.md` | Added note to E4 and E5 entries flagging them as needed before Phase 3 begins (Phase 2 is now complete). |

---

## Files Created

| File | Description |
|---|---|
| `docs/adr/ADR-005-server-actions-admin-forms.md` | Why Server Actions were chosen over API routes for admin product/service CRUD |
| `docs/adr/ADR-006-lazy-stripe-singleton.md` | Why lazy init was chosen over eager; documents the null guard pattern and fire-and-forget call sites |
| `docs/api-reference.md` | Documents all three Phase 2 API routes: `POST /api/admin/ebooks/[id]/upload`, `GET /api/ebooks/[id]/preview`, `GET /api/library/products` |

---

## ADRs Created

| Title | File |
|---|---|
| ADR-005: Server Actions for Admin Forms | `docs/adr/ADR-005-server-actions-admin-forms.md` |
| ADR-006: Lazy Stripe Singleton with Null Guard | `docs/adr/ADR-006-lazy-stripe-singleton.md` |

---

## Documentation Debt

| Item | Reason deferred |
|---|---|
| Stripe sync status visibility | `syncStripeProduct` and `syncStripeNewPrices` are fire-and-forget. No admin UI or logging surface shows whether sync succeeded for a given product. Phase 3 should add visibility (e.g. `stripe_sync_status` column). |
| Tags count accuracy in library API | `total` in `GET /api/library/products` reflects DB-filtered count only; tag matches are JS-applied post-query. Noted in api-reference.md. Exact count requires a Supabase RPC. |
| Server Action HTTP wrapper docs | Admin Server Actions are not HTTP endpoints and are not in the API reference. If an external caller ever needs access, a wrapper route and docs will be needed. |
