# PRD — Phase 4B: Sample Products & Admin Tools

## Phase Goal
Build sample product landing pages and download flow, admin user management with entry adjustment, sweepstakes CSV export, user profile entries page, public sweepstakes page, official rules page, and admin dashboard entry stats widget.

## Requirements

### R1 — Admin Sample Products CRUD
- `/admin/sample-products`: list all sample products with active status, capture count, confirmation rate stats
- Create/edit form at `/admin/sample-products/new` and `/admin/sample-products/[id]/edit`:
  - Fields: title, slug (auto-generated from title, editable), description (short), long_description (markdown), cover image upload → `covers` bucket, file upload (PDF) → `sample-products` bucket (private)
  - Capture config: require_email (always true, disabled toggle), require_phone (toggle)
  - Upsell config: upsell_product_id (dropdown of active ebooks), upsell_membership toggle, upsell_heading (text), upsell_body (text)
  - Entry config: custom_entry_amount (optional integer, overrides sweepstake.non_purchase_entry_amount)
  - Active/inactive toggle
- Stats shown on list: total captures, confirmed captures, confirmation rate (confirmed/total * 100)
- "View landing page" link → opens `/free/{slug}` in new tab
- Server Actions: createSampleProduct, updateSampleProduct, toggleSampleProductActive

### R2 — Sample Product Landing Page
- `/free/[slug]` (public, dynamic, ISR revalidate 60)
- Fetch sample_product by slug. If not found or `is_active=false`: 404.
- Layout (top to bottom):
  1. Hero: title (large), cover image (left) + description copy (right), sweepstake entry callout: "🎟️ Download free + earn {X} entries in our ${prize_description} sweepstake!" (X = custom_entry_amount OR sweepstake.non_purchase_entry_amount)
  2. Capture form: email (always), phone (if require_phone=true). Submit → POST /api/lead-capture with source='sample_product', sampleProductId. Success state: "📧 Check your email! Click the confirmation link to unlock your free download and earn your entries."
  3. Content section: render long_description as markdown (if set)
  4. Upsell section (if upsell_product_id or upsell_membership set):
     - If upsell_product_id: "Want to go deeper?" → featured ebook card with price, member price, entry badge, "Buy" CTA linking to /library/{ebook_slug}
     - If upsell_membership: membership pitch with "Join Omni Membership" CTA → /pricing
     - Custom upsell_heading/upsell_body from product config
  5. Sweepstake info block: current prize amount, countdown timer to end_at, link to /sweepstakes
- SEO: generateMetadata() with product title, description, cover image as OG

### R3 — Sample Product Download Page
- `/free/[slug]/download` (public, no auth required)
- Query param: `?token={confirmation_token}`
- On load: verify lead_captures by token, check confirmed_at IS NOT NULL
- If not confirmed (confirmed_at IS NULL): redirect to /confirm/{token} (let confirm page handle it)
- If no token or token not found: redirect to /free/{slug} (send them back to capture form)
- If confirmed:
  - Show: cover image, title, "Download" button
  - Download button → GET /api/sample-products/[slug]/download?token={token} → generates signed URL from sample-products bucket (1hr expiry) → redirect
  - Below download: upsell section (same as landing page section 4)
  - Entry confirmation: "🎟️ You earned {X} entries!"

### R4 — Sample Product Download API
- `GET /api/sample-products/[slug]/download`: public (no auth cookie), requires valid token query param
  - Look up lead_captures by token, verify confirmed_at IS NOT NULL
  - If not confirmed: 403
  - Get sample_product by slug, get file_path
  - Generate signed URL (1hr) from `sample-products` bucket
  - Redirect (307) to signed URL

### R5 — Admin User Management
- `/admin/users`: search page
  - Search input (text) → searches profiles by email, phone, display_name, username, order_number (ILIKE on text fields, exact match on order_number)
  - Results table: avatar, display_name, email, role badge, subscription status, created_at
  - Click → user detail page

- `/admin/users/[id]`: user detail page
  - Profile section: display_name, email, phone, role, stripe_customer_id, created_at
  - Subscription section: current plan, status, trial_end, period_end, cancel_at_period_end
  - Orders section: list of orders (order_number, date, total, status, items count)
  - E-books section: list of owned e-books
  - Entry breakdown section: per sweepstake — total entries, breakdown by source (purchase/non_purchase/admin/coupon_bonus)
  - Entry history section: scrollable list of all sweepstake_entries rows for this user (source, entries, date, notes)

### R6 — Admin Entry Adjustment
- Form on user detail page (`/admin/users/[id]`):
  - Fields: sweepstake (dropdown, defaults to active sweepstake), entries (integer, positive or negative), notes (required text)
  - Submit → Server Action `adjustUserEntries(userId, sweepstakeId, entries, notes)`:
    - Creates sweepstake_entries row with source='admin_adjustment', base_entries=entries value, total_entries=entries value, notes=notes
    - Negative entries are allowed (deductions)
    - Calls refreshEntryVerification()
  - Revalidates the user detail page

### R7 — Sweepstakes CSV Export
- `/admin/sweepstakes/[id]/export`: GET endpoint (admin only)
- Calls REFRESH MATERIALIZED VIEW CONCURRENTLY entry_verification first (via RPC)
- Queries entry_verification materialized view joined with profiles
- Returns CSV with columns (per §5.7 of blueprint): user_email, display_name, total_entries, purchase_entries, non_purchase_entries, admin_entries, coupon_bonus_entries, list_price_basis_cents, amount_collected_cents, actual_order_total_cents
- Content-Type: text/csv, Content-Disposition: attachment; filename=sweepstake-{id}-entries.csv

### R8 — User Entries Profile Page
- `/profile/entries`: auth required
- Fetch current active sweepstake
- If no active sweepstake: show "No active sweepstake right now. Check back soon!" with link to /sweepstakes
- If active: 
  - Large display: total entry count for current period
  - Breakdown: mini stats (purchase entries, non-purchase entries, admin adjustments, coupon bonuses)
  - Entry history list: scrollable list of own sweepstake_entries (date, source label, entries, notes for admin_adjustment)
  - "How to earn more entries" CTA section: links to library + /free (sample products)

### R9 — Public Sweepstakes Page
- `/sweepstakes` (public, ISR revalidate 60)
- Fetch active sweepstake (if exists) + any drawn sweepstakes (for past winners)
- Sections:
  1. Hero: current prize amount (large), prize_description, countdown timer to end_at
  2. "How it works": 3-step breakdown (enter free / buy to earn more / winner drawn)
  3. "Ways to enter": list entry methods — free popup/email capture, buying e-books (with entry rates), membership (entries per month/year), sample products (link to /free/[slug] for any active sample products)
  4. Link to official rules: `/sweepstakes/rules`
  5. Past winners section (if any drawn sweepstakes with winner_user_id set): "Previous Winners" with display_name, prize_description, drawn date
- If no active sweepstake: show "Our next sweepstake is coming soon" message

### R10 — Official Rules Page
- `/sweepstakes/rules` (static, no data fetching)
- Legal content placeholder covering: no purchase necessary, how to enter (free methods), eligibility (18+, US residents), prize description placeholder, odds of winning, drawing method, winner notification, claiming prize, sponsor (Omni Incubator)
- Mark with `{PLACEHOLDER — EXTERNAL TASK E14: Have legal review this content}`
- Static page, no ISR needed

### R11 — Admin Dashboard Stats Widget
- Update `/admin` page (currently redirects to /admin/products): make it a real dashboard page
- Stats cards:
  - Active members count (subscriptions with status IN ('trialing', 'active'))
  - Total revenue this month (SUM of orders.total_cents for current month, status='completed')
  - Active sweepstake summary: title, total entries, days remaining (if active sweepstake exists)
  - Warning banner if no active sweepstake
- Recent orders: last 10 orders with user email, amount, status
- Lead capture stats: pending confirmations count, confirmed today count
- Link to full sweepstake stats: /admin/sweepstakes/[id]

## Acceptance Criteria
1. Admin can create sample product with file upload, cover upload, capture config, upsell config
2. `/free/[slug]` renders for active sample product — 404 for inactive/missing
3. `/free/[slug]` capture form submits to /api/lead-capture with source='sample_product'
4. `/free/[slug]/download?token={valid_confirmed_token}` shows download button and upsell
5. `/free/[slug]/download` with unconfirmed token redirects to /confirm/{token}
6. `/free/[slug]/download` with no token redirects to /free/{slug}
7. `GET /api/sample-products/[slug]/download` returns 403 for unconfirmed token
8. `GET /api/sample-products/[slug]/download` returns signed URL redirect for confirmed token
9. `/admin/users` search returns results matching email/name/username
10. `/admin/users/[id]` shows profile, subscription, orders, e-books, entry breakdown
11. Admin entry adjustment creates sweepstake_entries row with source='admin_adjustment' and correct entries value (including negative)
12. `/admin/sweepstakes/[id]/export` returns valid CSV with correct columns
13. CSV export refreshes materialized view before generating data
14. `/profile/entries` shows total entries and breakdown for active sweepstake
15. `/profile/entries` shows "no active sweepstake" message when none exists
16. `/sweepstakes` renders with current prize, countdown, entry methods
17. `/sweepstakes/rules` renders with legal placeholder content
18. `/admin` dashboard shows stats cards (member count, revenue, sweepstake summary)
19. `/admin` dashboard shows no-sweepstake warning when none active
20. `npm run build` passes with no errors
21. `npx tsc --noEmit` passes with 0 errors

## Out of Scope for Phase 4B
- Marketplace service detail pages (Phase 5)
- Homepage hero content (Phase 6)
- SEO/sitemap (Phase 6)
- Production deployment (Phase 6)
