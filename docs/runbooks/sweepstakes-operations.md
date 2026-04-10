# Runbook: Sweepstakes Operations

Phase 4A delivers the sweepstakes entry engine and admin management UI. This runbook covers how to create and manage a sweepstake through the admin interface.

**Phase 4B will add:** drawing tools, winner notification, and CSV export. The drawing and export sections below are stubs to be completed in Phase 4B.

---

## Prerequisites

- You are logged in as an admin user (profile `role = 'admin'`).
- At least one e-book product exists in the library.
- The Resend domain is verified (`RESEND_FROM_EMAIL` set) so confirmation emails are delivered.
- Optionally: Upstash Redis configured (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) for lead-capture rate limiting.

---

## 1. Create a Sweepstake

1. Navigate to `/admin/sweepstakes`.
2. Click **New Sweepstake**.
3. Fill in the required fields:

| Field | Notes |
|---|---|
| Title | Displayed to users on the confirmation page and entry badge |
| Description | Internal — not currently shown publicly |
| Prize description | Shown on the lead capture popup and confirmation page |
| Prize amount (cents) | Optional — used for display if set |
| Start date | The sweepstake goes live when activated, not at this date |
| End date | Displayed to users as the entry deadline |
| Non-purchase entry amount | Entries awarded per confirmed lead capture (default: 1) |
| Official rules URL | Link to the legal rules page (required before launch — see E14) |

4. Click **Save**. The sweepstake is created with `status = 'draft'`.

---

## 2. Activate a Sweepstake

Only one sweepstake can be active at a time. Attempting to activate a second sweepstake while one is already active will show an error: "Another sweepstake is already active."

To activate:

1. Go to `/admin/sweepstakes` and click the sweepstake title to open the edit page.
2. Click **Activate**. Status changes to `active`.

Once active:
- The entry badge appears on library product cards and detail pages.
- The lead capture popup becomes live in the root layout.
- Entry awarding in Stripe webhooks begins immediately for purchases.

---

## 3. Create Entry Multipliers

Multipliers increase the number of entries earned during a time window (e.g., "Double Entry Weekend").

1. Open the sweepstake edit page (`/admin/sweepstakes/[id]`).
2. Click **Manage Multipliers**.
3. Click **Add Multiplier** and fill in:

| Field | Notes |
|---|---|
| Name | Shown in the MultiplierBanner (e.g., "2X Entry Weekend") |
| Multiplier value | Decimal — e.g., `2.0` for double entries |
| Start date/time | When the multiplier becomes active |
| End date/time | When it expires |
| Active toggle | Must be toggled on for the multiplier to apply |

4. If date ranges overlap with an existing multiplier, a warning is shown but the save proceeds. The system takes the maximum multiplier value when calculating entries.
5. The multiplier banner in the site layout refreshes its cache every 60 seconds.

---

## 4. Create Coupons

Coupons let specific users earn bonus entries (multiplier or fixed-bonus type).

1. Navigate to `/admin/coupons` and click **New Coupon**.
2. Fill in:

| Field | Notes |
|---|---|
| Code | Uppercase automatically on blur; case-insensitive at redemption; disabled in edit mode |
| Type | `percent` (multiplier — e.g., 1.5 for 50% more) or `fixed_bonus` (flat extra entries) |
| Value | For `percent`: decimal multiplier. For `fixed_bonus`: integer entry count |
| Max uses | Global redemption cap (null = unlimited) |
| Max uses per user | Per-user cap (null = unlimited) |
| Expires at | Optional expiry date |
| Active | Toggle to enable/disable without deleting |

Coupons are applied at checkout (Stripe coupons for discounts) and at entry calculation time for sweepstake bonus entries. See `src/lib/sweepstakes.ts` → `fetchCoupon` for the runtime lookup.

---

## 5. End a Sweepstake

When the entry period is over:

1. Open the sweepstake edit page.
2. Click **End Sweepstake**. Status changes to `ended`.

Once ended:
- No new entries are awarded for purchases or lead captures.
- The entry badge and lead capture popup no longer appear (no active sweepstake).
- The sweepstake record is preserved for the drawing.

---

## 6. Run a Drawing (Phase 4B — stub)

Drawing tools will be added in Phase 4B. Until then, a winner can be selected manually:

1. Export the entries for the sweepstake from the `sweepstake_entries` table (Supabase Dashboard → Table Editor → `sweepstake_entries`, filter by `sweepstake_id`).
2. Select a winner based on your official rules (weighted by `total_entries` if applicable).
3. Update `sweepstakes.winner_user_id` and `winner_drawn_at` directly in the database.

---

## 7. Export Entries as CSV (Phase 4B — stub)

A CSV export UI will be added in Phase 4B. Until then, use the Supabase Dashboard:

1. Go to Supabase Dashboard → Table Editor → `sweepstake_entries`.
2. Filter by `sweepstake_id` (the UUID of the completed sweepstake).
3. Use the Export button to download as CSV.

The export includes: `user_id`, `total_entries`, `source`, `created_at`, `order_id`, `product_id`.

---

## Entry Sources

| `source` value | Trigger |
|---|---|
| `purchase` | Stripe `checkout.session.completed` (payment or combined mode) |
| `subscription_renewal` | Stripe `invoice.paid` (renewal, when no combined-checkout order exists) |
| `non_purchase_capture` | `POST /api/lead-capture/confirm` — after email confirmation |

---

## Troubleshooting

**Entry badge not showing on library cards:**
- Confirm a sweepstake is active (`status = 'active'` in DB).
- The `EntryBadge` component caches for 60s — wait for cache to expire or trigger `revalidateTag('active-sweepstake')`.

**Lead capture confirmation emails not arriving:**
- Check `email_log` table in Supabase for delivery errors.
- Confirm `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are set and the domain is verified in Resend.

**Rate limiting not working:**
- Confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set. Without them, rate limiting is skipped silently — the endpoint still works but is unprotected.

**"Another sweepstake is already active" error when activating:**
- End the currently active sweepstake first, then activate the new one.
