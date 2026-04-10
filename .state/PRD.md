# PRD — Phase 4A: Sweepstakes Core

## Phase Goal
Build the complete sweepstakes entry system: entry calculation engine, lead capture with email confirmation, entry awarding on purchases and confirmed captures, admin sweepstake/multiplier/coupon management, entry badges on products, multiplier banner.

**Pre-requisite note:** Resend domain verification (EXTERNAL TASK E9/E18) is required for confirmation emails to deliver. If Resend is not configured, the confirmation email send will fail gracefully (logged, not thrown). The pipeline continues — the system is built correctly regardless.

## Requirements

### R1 — Entry Calculation Engine
- `src/lib/sweepstakes.ts` exports:

**`calculateEntries(params)`** — pure function per blueprint §5.1:
```typescript
{
  product: { price_cents, member_price_cents, custom_entry_amount },
  listPriceCents: number,   // ALWAYS full list price
  pricePaidCents: number,   // actual amount charged (audit only)
  sweepstakeId: string,
  couponId?: string,
}
→ { baseEntries, multiplier, couponMultiplier, bonusEntries, totalEntries, listPriceCents, amountCents }
```
- baseEntries = custom_entry_amount if set, else floor(listPriceCents / 100)
- globalMultiplier = MAX(active multipliers for sweepstake) or 1.0
- coupon: if multiplier type → couponMultiplier = entry_value; if fixed_bonus → bonusEntries = entry_value
- totalEntries = floor(baseEntries * globalMultiplier * couponMultiplier) + bonusEntries

**`awardPurchaseEntries(params)`** — called from webhook handler:
```
{ orderId, orderItemId, productId, userId, sweepstakeId, listPriceCents, pricePaidCents, couponId? }
→ creates sweepstake_entries row with source='purchase', inserts into DB
→ calls refreshEntryVerification() after insert
→ returns { totalEntries } or null if no active sweepstake
```

**`awardLeadCaptureEntries(params)`** — for non-purchase captures per §5.2b:
```
{ leadCaptureId, userId?, sweepstakeId, sampleProductId? }
→ base entries = sample_product.custom_entry_amount || sweepstake.non_purchase_entry_amount
→ NO global multipliers, NO coupons
→ creates sweepstake_entries row with source='non_purchase_capture'
→ returns { totalEntries }
```

**`refreshEntryVerification()`** — debounced: calls `REFRESH MATERIALIZED VIEW CONCURRENTLY entry_verification`. Debounce: track last_refresh timestamp, skip if refreshed within last 60 seconds.

**Unit tests**: Write Vitest unit tests for calculateEntries and awardLeadCaptureEntries covering the cases in §5.1 and §5.2b of the blueprint.

### R2 — Wire Entry Awarding into Webhook
Replace the `// TODO Phase 4A` stubs in `src/app/api/webhooks/stripe/route.ts`:
- On `checkout.session.completed` (payment mode): after order creation, call `awardPurchaseEntries()` for each order_item
- On `checkout.session.completed` (subscription + one-time items): award entries for the e-book item only, set `entries_awarded_by_checkout = true` on the order
- On `invoice.paid` (amount > 0, not proration): call `awardPurchaseEntries()` for the subscription renewal. Check `entries_awarded_by_checkout` on related order before awarding to prevent double-count.

### R3 — Lead Capture API
- `POST /api/lead-capture`: public, rate limited 5/IP/hour via Upstash Redis
  - Body: `{ email: string, phone?: string, source: 'popup' | 'footer' | 'marketplace_coming_soon' | 'sample_product', sweepstakeId?: string, sampleProductId?: string }`
  - Validate email format
  - Find active sweepstake (if sweepstakeId not provided, find the one with status='active')
  - Check duplicate: does lead_captures row exist with same email + sweepstake_id? If yes: return 200 with `{ duplicate: true, message: "You've already entered" }`
  - Generate `confirmation_token` (crypto.randomUUID())
  - Create lead_captures row with `confirmed_at = NULL`, `entry_awarded = false`, `confirmation_sent_at = NOW()`
  - Send confirmation email (lead_capture_confirm or sample_product_confirm template depending on source)
  - Return: `{ success: true }`
  - If Upstash not configured: skip rate limiting, log warning

### R4 — Email Confirmation API
- `POST /api/lead-capture/confirm`: public, no auth
  - Body: `{ token: string }`
  - Look up lead_captures by confirmation_token
  - If not found: return 404 `{ error: 'Invalid or expired token' }`
  - If already confirmed (confirmed_at IS NOT NULL): return 200 `{ alreadyConfirmed: true, entries: N, source }`
  - If token older than 72 hours (confirmation_sent_at < NOW() - 72h): return 410 `{ error: 'Token expired', email }` (include email so they can re-submit)
  - Set `confirmed_at = NOW()`, `entry_awarded = true`
  - Call `awardLeadCaptureEntries()`
  - Determine redirect: if source='sample_product': return `{ redirect: '/free/{slug}/download?token={token}' }`; else: return `{ success: true, entries: N, source, sweepstake: { title, prize_description } }`

### R5 — Resend Confirmation API
- `POST /api/lead-capture/resend`: public, rate limited 1/5min per email via Upstash
  - Body: `{ email: string }`
  - Look up pending lead_captures by email (confirmed_at IS NULL), most recent
  - If not found: return 200 silently (no enumeration)
  - If token age < 5 minutes: return 429 (too soon)
  - If token age > 72 hours: return 410 (expired, must re-submit form)
  - Regenerate confirmation_token, update confirmation_sent_at
  - Resend confirmation email
  - Return 200

### R6 — Lead Capture Popup
- `src/components/sweepstakes/LeadCapturePopup.tsx`: client component
  - Trigger: setTimeout 10s OR scroll to 50% of document.body.scrollHeight (whichever fires first)
  - Suppression:
    - `localStorage.getItem('omni_popup_dismissed')` with timestamp — re-show after 30 days
    - `localStorage.getItem('omni_popup_submitted')` — never show again once submitted
  - UI: modal dialog (shadcn Dialog), headline "🎟️ Enter for a chance to win ${prize_amount}", email input (required), phone input (optional), submit button
  - On submit: POST /api/lead-capture with source='popup'
  - Success state: "📧 Check your email to confirm your entry!" with "Resend email" button (calls /api/lead-capture/resend)
  - On dismiss: set omni_popup_dismissed timestamp in localStorage
  - Also: an inline version `LeadCaptureForm` (no popup behavior, just the form) for the marketplace page and footer

### R7 — Email Confirmation Page
- `/confirm/[token]` page: public, no auth
  - On mount: calls `POST /api/lead-capture/confirm` with token from URL
  - If source='sample_product': redirects to `/free/{slug}/download?token={token}`
  - If popup/other:
    - Success: "✅ You're in! You earned {N} entries in the {sweepstake_title} sweepstake."
    - Shows upsell CTAs: "Browse the E-book Library" + "Join Omni Membership"
    - If active multiplier: "{M}X entry bonus active on all purchases!"
  - Error states:
    - Invalid token: "This link is invalid. Submit your email again." + link to homepage
    - Expired: "This link has expired (72 hours). Enter your email again to get a new one." + email re-submit form
    - Already confirmed: "You've already confirmed! You have {N} entries." + upsell CTAs

### R8 — Lead → Account Linking
- After new user signup (auth.users INSERT trigger calls handle_new_user which already links lead_captures):
  - Application code on callback route: after session is established, run:
    ```sql
    UPDATE sweepstake_entries SET user_id = $new_user_id
    WHERE lead_capture_id IN (
      SELECT id FROM lead_captures WHERE user_id = $new_user_id
    ) AND user_id IS NULL
    ```
  - Add this SQL call to `src/app/api/auth/callback/route.ts` after session exchange

### R9 — Admin Sweepstakes CRUD
- `/admin/sweepstakes`: list all sweepstakes with status badges (draft/active/ended/drawn)
- Create/edit form: title, description, prize_amount_cents, prize_description, start_at, end_at, non_purchase_entry_amount, official_rules_url
- Activate button: sets status='active'. Pre-check: if another sweepstake is already active → show error "Another sweepstake is already active"
- End button: sets status='ended'
- Status transitions: draft→active→ended→drawn

### R10 — Admin Multipliers
- `/admin/sweepstakes/[id]/multipliers`: list multipliers for selected sweepstake
- Create/edit form: name, description, multiplier value, start_at, end_at, is_active toggle
- Overlap warning: check if new multiplier period overlaps any existing active multiplier → show warning but allow save
- Toggle active/inactive

### R11 — Admin Coupons (Entry Bonus Only)
- `/admin/coupons`: list all coupons with status, usage count, expiry
- Create/edit form: code (input, auto-uppercased on blur), name, entry_type (multiplier/fixed_bonus), entry_value, max_uses_global, max_uses_per_user (default 1), expires_at, sweepstake assignment (optional dropdown)
- Code is immutable after creation (no edit on code field in edit mode)
- Toggle active/inactive

### R12 — Entry Badge Component
- `src/components/sweepstakes/EntryBadge.tsx`:
  - Props: `{ product: { price_cents, custom_entry_amount }, className? }`
  - Server-side: fetch active sweepstake + active multiplier (cached 60s with unstable_cache)
  - Compute base entries (custom_entry_amount OR floor(price_cents/100))
  - If active multiplier: show `🔥 {M}X ENTRIES — Earn {N} entries`
  - Else: show `🎟️ Earn {N} entries`
  - Used on product cards in library and on e-book detail page

### R13 — Multiplier Banner
- `src/components/sweepstakes/MultiplierBanner.tsx`:
  - Server component, fetches active multiplier for active sweepstake (cached 60s)
  - If active multiplier exists: renders banner at top of layout with: "{multiplier.name} — {M}X entries on all purchases! Ends {end_at formatted}"
  - Dismissable with X button (client state, shows inline — NOT localStorage, re-shows on page load)
  - Wire into root layout in the multiplier banner slot (the empty div from Phase 1)

### R14 — Wire Entry Badges on Library
- Update product cards in `/library` to use `<EntryBadge product={product} />`
- Update `/library/[slug]` detail page: show entry badge + "Members earn {N} entries (based on full $X price)" note

### R15 — Admin No-Sweepstake Warning
- On admin dashboard (`/admin` or `/admin/products`): query for active sweepstake. If none: show a warning banner "⚠️ No active sweepstake — purchases are not earning entries"

## Acceptance Criteria
1. `calculateEntries()` returns correct results for all 5 test cases in §5.2 of blueprint (custom_entry_amount, dollar-based, multiplier, coupon multiplier, fixed_bonus coupon)
2. `awardLeadCaptureEntries()`: base entries = sweepstake.non_purchase_entry_amount, multiplier=1.0, coupon_multiplier=1.0
3. `POST /api/lead-capture` returns 200 and creates lead_captures row with confirmed_at=NULL
4. Duplicate email+sweepstake_id POST returns 200 with `{ duplicate: true }`
5. `POST /api/lead-capture/confirm` with valid token: sets confirmed_at, sets entry_awarded=true, creates sweepstake_entries row
6. Confirm with expired token (>72h): returns 410
7. Confirm with already-confirmed token: returns 200 with alreadyConfirmed=true
8. Confirm with sample_product source: returns redirect to download page
9. `POST /api/lead-capture/resend` with valid email: regenerates token, returns 200
10. Webhook checkout.session.completed (payment): sweepstake_entries row created for each order_item
11. Webhook invoice.paid (amount>0): sweepstake_entries row created for subscription renewal
12. Webhook invoice.paid ($0 trial): no entries created
13. entries_awarded_by_checkout dedup: combined checkout doesn't double-award on invoice.paid
14. `/confirm/[token]` page loads and shows success state for valid confirmed token
15. `/confirm/[token]` shows error for invalid token
16. LeadCapturePopup renders in root layout, triggers after 10s/50% scroll
17. EntryBadge component renders with correct entry count on library cards
18. MultiplierBanner renders in layout when active multiplier exists
19. Admin can create/activate/end sweepstake. Duplicate activate shows error.
20. Admin can create/edit/toggle multipliers with overlap warning
21. Admin can create/toggle coupons. Code uppercased automatically.
22. `npm run build` passes with no errors
23. `npx tsc --noEmit` passes with 0 errors
24. Vitest unit tests for calculateEntries pass

## Out of Scope for Phase 4A
- Sample product landing pages and download pages (Phase 4B)
- Admin user management and entry adjustment (Phase 4B)
- Entry export CSV (Phase 4B)
- /profile/entries page (Phase 4B)
- /sweepstakes public page (Phase 4B)
