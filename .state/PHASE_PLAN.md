# Phase Plan — Omni Incubator

## Phase 1: Foundation
Status: COMPLETE
Dependencies: none
PRD excerpt:
  Init Next.js 14 App Router project with TypeScript, Tailwind, ESLint, src/ structure.
  Install + configure shadcn/ui components (Button, Card, Input, Dialog, DropdownMenu, Badge, Toast, Tabs, Table, Sheet, Skeleton).
  Set up three Supabase client variants: lib/supabase/client.ts (browser), lib/supabase/server.ts (server), lib/supabase/admin.ts (service role).
  Write ALL database migration SQL files in supabase/migrations/ covering every table, trigger, function, index, and seed data from §2 of the blueprint (profiles, products, ebooks, services, orders, order_items, subscriptions, user_ebooks, sweepstakes, entry_multipliers, coupons, coupon_uses, sweepstake_entries, lead_captures, sample_products, email_log, processed_stripe_events, materialized view entry_verification, all triggers and indexes).
  Create Supabase Storage bucket definitions (ebooks private, ebook-previews public, sample-products private, avatars public, covers public).
  Implement Auth: email OTP flow (/login page, signInWithOtp, verifyOtp). Google OAuth with callback at /api/auth/callback.
  Auth middleware for /profile/* and /admin/* routes using @supabase/ssr cookie-based auth. Admin routes check profiles.role = 'admin'.
  Profile page /profile (view + edit all fields, username uniqueness check, set profile_complete = true when all required fields filled).
  Root layout with nav (logo, Library, Pricing, Marketplace, Sweepstakes, auth state), footer, responsive mobile nav, Rewardful JS snippet in <head>, multiplier banner slot.
  Sentry setup with @sentry/nextjs.
  .env.local.example with all variables from §14.
  Exit criteria: User can sign up with email OTP or Google, see auto-generated profile, and edit it.

## Phase 2: Products & Library
Status: COMPLETE
Dependencies: Phase 1 complete
PRD excerpt:
  Admin layout at /admin with sidebar nav (Dashboard, Products, E-books, Sample Products, Services, Orders, Users, Sweepstakes, Coupons, Settings), auth middleware, 403 for non-admins.
  Admin product CRUD: create/edit/delete e-book products. Form fields: title, description, long_description (markdown), price, cover image upload, category, subcategory, tags, operator_dependency, scale_potential, cost_to_start, custom_entry_amount, is_active toggle. Slug auto-generated on create.
  E-book file upload on product create/edit: upload PDF to ebooks bucket (private), optional preview PDF to ebook-previews bucket (public). Store paths in ebooks table. Max 100MB.
  Stripe product sync on admin product create: auto-create Stripe Product + 2 Prices (full + member) via API. Guard with if (!STRIPE_SECRET_KEY) skip — sync is idempotent, runs when keys configured.
  Library page /library: product grid, filter sidebar (category, operator_dependency, scale_potential, cost_to_start — multi-select, OR within group, AND between groups), search (debounced 300ms, full-text on title+tags+description), sort (Newest, Price Low→High, Price High→Low, Title A→Z), pagination (12 per page, load more). Server-rendered with search params. Public page.
  E-book detail page /library/[slug]: cover, title, author, description, preview download button, price display (full + member price). Buy CTA placeholder (Phase 3). Entry badge placeholder (Phase 4A). Note "You already own this" if owned, but keep Buy button active.
  Preview download: public endpoint stream preview PDF from ebook-previews bucket. No auth.
  Admin services CRUD: create/edit services with all schema fields. All marked is_coming_soon=true at launch.
  Marketplace page /marketplace: Coming Soon hero, grid of service cards (if any exist) with Coming Soon badge. Email capture form placeholder (Phase 4A).
  Exit criteria: Admin can create e-book products with files and covers. Public library page shows products with filters/search. Preview downloads work.

## Phase 3: Billing
Status: COMPLETE
Dependencies: Phase 2 complete
PRD excerpt:
  lib/stripe.ts utility: getOrCreateStripeCustomer(userId) — check profile, create if needed, store stripe_customer_id.
  isActiveMember(userId) utility: checks subscription status IN ('trialing', 'active').
  POST /api/checkout/membership: Stripe Checkout subscription mode, 7-day trial, read Rewardful referral cookie → clientReferenceId, pre-check no existing active sub. Monthly vs annual from body.
  POST /api/checkout/ebook: Stripe Checkout payment mode. Member price if applicable. No ownership block. Rewardful cookie.
  POST /api/checkout/ebook-with-membership: subscription mode + one-time line item. Rewardful cookie.
  POST /api/coupons/validate: validate entry bonus coupon (case-insensitive), return entry effect. Price discounts handled by Stripe natively.
  Migration for processed_stripe_events table.
  POST /api/webhooks/stripe: full implementation per §4.7 and §9. Transactional idempotency per §13.1. All events: checkout.session.completed, customer.subscription.created/updated/deleted/trial_will_end, invoice.paid (amount>0, skip $0 trial invoices, skip proration-only), invoice.payment_failed. entries_awarded_by_checkout dedup flag on combined checkout.
  Order creation: order with order_number, line items, coupon info, discount_cents from session.total_details.
  /profile/orders: paginated order history with line items. Auth required.
  /profile/ebooks: grid of owned e-books with download buttons. Auth required.
  GET /api/ebooks/[id]/download: auth + ownership check → signed URL (1hr) → redirect. Increment download_count.
  /ebooks/download/[id]: post-checkout success and re-download page. Auth required.
  /profile/subscription: current plan + status + Manage Subscription → Stripe Customer Portal.
  POST /api/subscription/portal: create Stripe billing portal session → redirect.
  Beehiiv integration: subscribe on subscription.created (status trialing/active), remove on subscription.deleted.
  Resend transactional email client + templates: ebook_purchase, membership_welcome, membership_charged, trial_ending, payment_failed, entry_awarded. Email log all sent emails to email_log table.
  Exit criteria: Full purchase and subscription flow works end-to-end. Downloads, webhooks, emails all functional.

## Phase 4A: Sweepstakes Core
Status: COMPLETE
Dependencies: Phase 3 complete (Resend must be configured before this phase)
PRD excerpt:
  lib/sweepstakes.ts: calculateEntries() per §5.1. awardPurchaseEntries(), awardLeadCaptureEntries() per §5.2b, awardAdminAdjustment(). Unit test these.
  Hook entry awarding into webhook handler: on checkout.session.completed (one-time) and invoice.paid (subscription, amount>0). Respect combined-checkout dedup flag. No-op if no active sweepstake.
  POST /api/lead-capture: validate email/phone, check duplicate, find active sweepstake, create lead_captures row with confirmation_token, send confirmation email (NOT entry yet). Rate limit 5/IP/hour via Upstash.
  POST /api/lead-capture/confirm: validate token, check 72hr expiry, set confirmed_at, create sweepstake_entries row, return redirect URL by source. Idempotent.
  POST /api/lead-capture/resend: resend confirmation email by email address. Rate limit 1/5min/email.
  Resend email templates: lead_capture_confirm (popup) and sample_product_confirm (includes cover image + product title).
  Lead capture popup: client component, trigger on 10s timer or 50% scroll, email+phone form, POST /api/lead-capture, success state "Check your email!", localStorage suppression keys. Also inline form on marketplace page.
  /confirm/[token]: calls confirm API on load. If sample_product: redirect to download page. If popup: show "You're in!" + entry count + upsell CTAs. Error states: invalid/expired/already-confirmed.
  Lead → account linking: application code on signup updates orphaned sweepstake_entries with new user_id.
  /admin/sweepstakes: list, create, edit, activate, end. Validation: can't activate if another is active.
  /admin/sweepstakes/[id]/multipliers: list, create, edit, toggle active. Overlap warning.
  /admin/coupons: list, create, edit, toggle. Code auto-uppercased. Usage count vs max.
  EntryBadge component: takes product, shows computed entries, adjusts for active multiplier.
  MultiplierBanner component: queries active multiplier, shows at top of layout if active.
  Materialized view refresh after entry inserts (debounced, at most once per minute).
  Exit criteria: Entry engine works end-to-end. Purchase entries award on webhook. Lead capture entries award on confirmed email. Admin can manage sweepstakes, multipliers, coupons.

## Phase 4B: Sample Products & Admin Tools
Status: COMPLETE
Dependencies: Phase 4A complete
PRD excerpt:
  /admin/sample-products: create/edit with file upload to sample-products bucket, capture config (require_email always, require_phone toggle), upsell config (upsell_product_id dropdown, upsell_membership toggle, custom upsell_heading/body), custom entry amount, active toggle. Stats: captures, confirmation rate.
  /free/[slug]: hero (cover + description), capture form (fields from sample config), email on submit, success state, upsell section, sweepstake callout. SEO: dynamic meta, OG image.
  /free/[slug]/download?token={token}: verify token confirmed, show download button (signed URL from sample-products bucket, 1hr), upsell section, entry confirmation.
  /admin/users: search by email/phone/name/order number. Results list → user detail.
  /admin/users/[id]: entry breakdown by source, entry history, order history.
  Entry adjustment form on user detail: sweepstake (defaults to active), entries (positive or negative), notes required. source='admin_adjustment'.
  /admin/sweepstakes/[id]/export: CSV download. Columns per §5.7. Refresh materialized view first.
  /profile/entries: current sweepstake entry count, breakdown by source, entry history list. Show "No active sweepstake" if none.
  /sweepstakes: current prize, countdown timer, how it works, entry methods, link to official rules. Show past winners if drawn sweepstakes exist.
  /sweepstakes/rules: static legal content. No purchase necessary, alternate entry method, eligibility, prize.
  Admin dashboard widget: sweepstake summary card, lead capture stats.
  Exit criteria: Sample product landing captures leads and delivers file after confirmation. Admin can manage sample products, view/adjust user entries. CSV export works.

## Phase 5: Marketplace Shell
Status: PENDING
Dependencies: Phase 4B complete
PRD excerpt:
  /marketplace/[slug]: service detail page with Coming Soon overlay. Rate display including Custom/Inquire for custom rate_type.
  Service entry badge: show entry badge even in Coming Soon state if custom_entry_amount is set.
  Admin service approval flow: status pending → approved → active. Toggle in service edit form.
  Exit criteria: Marketplace shows Coming Soon with service previews. Admin can manage services.

## Phase 6: Polish & Deploy
Status: PENDING
Dependencies: Phase 5 complete
PRD excerpt:
  Homepage /: hero (headline, subheadline, CTA buttons Browse Library + Join Now), current sweepstake prize callout, featured e-books, how it works section.
  SEO: generateMetadata() on all pages, dynamic OG images for e-book pages, sitemap.xml, robots.txt. Use Next.js metadata API.
  Mobile responsive: test at 375px, 768px, 1024px, 1440px. Fix all layout breaks. Touch targets ≥44px.
  Loading states: skeleton loaders on library, profile, admin lists. Button loading spinners on all form submissions.
  Error handling: global Sentry error boundary, toast notifications for API errors, inline form validation, 404 and 500 pages.
  RLS policy audit: test every table — anon can't read private data, users see only own data, admin sees all. Write test script.
  Webhook reliability test: double-delivery (idempotency), out-of-order events.
  Edge case testing per §6.8 checklist.
  Performance: Lighthouse audit, Next.js Image component with WebP, query optimization.
  Legal pages: /privacy, /terms, /sweepstakes/rules — placeholder content (mark EXTERNAL TASK for legal review).
  vercel.json config if needed. .env.local.example already done in Phase 1.
  Exit criteria: Production-ready. All core flows verified. Deployed to Vercel.
