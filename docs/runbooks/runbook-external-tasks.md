# Runbook: External Tasks Checklist (E1–E20)

These tasks require human intervention — browser actions, account creation, or credential retrieval. They cannot be automated by the build pipeline.

Status key: `[ ]` = not done, `[x]` = complete

---

## Phase 1 — Foundation

### E1 — Create Supabase project (production)
**Blocking:** Yes

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. Note the **Project URL**, **anon key**, and **service_role key** from Project Settings → API.
3. Add them to `.env.local` (and to Vercel environment variables when deploying).
4. Note the **project ref** (subdomain) for `supabase link`.

- [ ] Supabase project created
- [ ] Credentials added to `.env.local`

---

### E2 — Configure Supabase Auth settings
**Blocking:** Yes

In Supabase Dashboard → Authentication → Settings:

1. **Email**: Enabled
2. **Email OTP**: Enabled (Confirm email = OTP mode)
3. **Magic Links**: Disabled
4. **OTP Expiry**: 600 seconds (10 minutes)
5. **Secure email change**: Enabled
6. **Site URL**: `http://localhost:3000` (change to `https://omniincubator.org` before launch)
7. **Redirect URLs**: Add `http://localhost:3000/api/auth/callback` and `https://omniincubator.org/api/auth/callback`

Full details in [supabase/auth-config.md](../../supabase/auth-config.md).

- [ ] OTP enabled, magic links disabled
- [ ] Site URL configured
- [ ] Redirect URLs added

---

### E3 — Create Google Cloud OAuth client ID and secret
**Blocking:** No (OTP auth works without Google OAuth)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials.
2. Create an OAuth 2.0 Client ID (Web application).
3. Add authorized redirect URIs:
   - `https://<your-supabase-project>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret**.
5. In Supabase Dashboard → Authentication → Providers → Google: enter the Client ID and Client Secret.

- [ ] Google Cloud project created
- [ ] OAuth client ID created
- [ ] Redirect URI added
- [ ] Client ID + Secret entered in Supabase Auth

---

### E10 — Create Sentry project, get DSN
**Blocking:** No (app no-ops gracefully without DSN)

1. Go to [sentry.io](https://sentry.io) and create a new project (Next.js).
2. Copy the DSN from Project Settings → Client Keys → DSN.
3. Add to `.env.local` as `NEXT_PUBLIC_SENTRY_DSN`.
4. Optionally create an auth token (User Settings → Auth Tokens) and add as `SENTRY_AUTH_TOKEN` for source map upload during CI builds.

- [ ] Sentry project created
- [ ] DSN added to environment variables

---

## Phase 3 — Payments and Membership

### E4 — Create Stripe account, get API keys (test mode)
**Blocking:** Yes for Phase 3 — **Phase 2 is complete; E4 is needed before Phase 3 begins**

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API Keys.
2. Copy **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Copy **Secret key** → `STRIPE_SECRET_KEY`

- [ ] Stripe account created
- [ ] Test mode API keys added to environment variables

---

### E5 — Create Stripe Products and Prices for membership
**Blocking:** Yes for Phase 3 — **Phase 2 is complete; E5 is needed before Phase 3 begins**

Create two products in Stripe Dashboard (or via API):

| Product | Price | Billing | ENV var for Price ID |
|---|---|---|---|
| Omni Membership — Monthly | $15.00 / month | Recurring | `STRIPE_MONTHLY_PRICE_ID` |
| Omni Membership — Annual | $129.00 / year | Recurring | `STRIPE_ANNUAL_PRICE_ID` |

Add the Stripe Price IDs (format: `price_...`) to environment variables.

Note: The database seed data (`20240101000014_seed_data.sql`) inserts placeholder product rows for these memberships. The Stripe Price IDs must be added to the `products` table `stripe_price_id` column after the Stripe products are created (Phase 3 admin flow).

- [ ] Monthly membership product + price created in Stripe
- [ ] Annual membership product + price created in Stripe
- [ ] Price IDs added to environment variables

---

### E6 — Configure Stripe webhook endpoint
**Blocking:** Yes for Phase 3

1. In Stripe Dashboard → Developers → Webhooks: Add endpoint.
2. URL: `https://omniincubator.org/api/webhooks/stripe`
3. Select events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
4. Copy the **Signing secret** → `STRIPE_WEBHOOK_SECRET`

For local testing: use `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

- [ ] Webhook endpoint configured in Stripe
- [ ] Signing secret added to environment variables

---

### E7 — Configure Stripe Customer Portal
**Blocking:** Yes for Phase 3

In Stripe Dashboard → Settings → Billing → Customer Portal:

1. Enable: Allow customers to switch plans (monthly ↔ annual)
2. Enable: Allow customers to cancel subscriptions
3. Enable: Allow customers to update payment methods
4. Save the portal configuration

This is the only subscription management UI — no custom subscription update pages are built in the app.

- [ ] Customer portal configured in Stripe

---

### E8 — Create Beehiiv account, get API key and publication ID
**Blocking:** No for Phase 3 — **needed before Phase 4A** (membership welcome/cancel Beehiiv sync is live; without keys, subscribe/unsubscribe calls are silently skipped and new members are not added to the newsletter)

1. Go to [app.beehiiv.com](https://app.beehiiv.com) → Settings → Integrations → API.
2. Copy **API key** → `BEEHIIV_API_KEY`
3. Copy **Publication ID** (format: `pub_...`) → `BEEHIIV_PUBLICATION_ID`

- [ ] Beehiiv account created
- [ ] API key and publication ID added to environment variables

---

### E9 — Create Resend account, verify domain, get API key
**Blocking:** Yes for Phase 4A — **complete before Phase 4A begins** (transactional emails — ebook purchase receipts, membership welcome, trial ending, payment failed — are silently skipped without Resend keys; Phase 4A lead capture confirmation emails require a verified sender domain)

1. Go to [resend.com](https://resend.com) → API Keys: create a key → `RESEND_API_KEY`
2. Go to Domains: add `omniincubator.org`, follow DNS verification steps.
3. Set `RESEND_FROM_EMAIL` to a verified address on the domain (e.g., `hello@omniincubator.org`).

- [ ] Resend account created
- [ ] Domain verified in Resend
- [ ] API key added to environment variables
- [ ] From address configured

---

### E18 — Resend domain verification (confirmed from Phase 3 requirements)
**Blocking:** Yes for Phase 4A — **complete before Phase 4A begins**

This is the same action as E9. Ensure domain DNS records (SPF, DKIM, DMARC) are fully propagated before Phase 4A launch. Confirmation emails from lead capture will not be delivered without a verified sender domain. DNS propagation can take up to 48 hours — complete this well in advance.

- [ ] DNS records propagated and verified in Resend dashboard

---

### E20 — Create Rewardful account, connect Stripe, configure commission structure
**Blocking:** No (affiliate tracking is additive; checkout works without it)

1. Go to [getrewardful.com](https://www.getrewardful.com) and create an account.
2. Connect your Stripe account.
3. Configure commission: percentage per sale, recurring vs one-time, cookie duration, payout thresholds.
4. Copy the **Client-side API key** → `NEXT_PUBLIC_REWARDFUL_API_KEY`

The Rewardful JS snippet (`r.wdfl.co/rw.js`) is already included in the root layout and becomes active once the API key is set.

- [ ] Rewardful account created
- [ ] Stripe connected
- [ ] Commission structure configured
- [ ] API key added to environment variables

---

## Phase 4A — Lead Capture and Sweepstakes

### E19 — Create Upstash Redis database, get REST credentials
**Blocking:** No (lead capture works without rate limiting) — **needed before launch** (without Upstash, the `/api/lead-capture` and `/api/lead-capture/resend` endpoints have no IP-based rate limiting; a DB-level 5-minute cooldown still protects resend, but burst abuse on the submit endpoint is unprotected)

1. Go to [console.upstash.com](https://console.upstash.com) and create a Redis database (free tier is sufficient).
2. Copy **REST URL** → `UPSTASH_REDIS_REST_URL`
3. Copy **REST token** → `UPSTASH_REDIS_REST_TOKEN`

- [ ] Upstash Redis database created
- [ ] REST URL and token added to environment variables

---

## Phase 6 — Launch

### E11 — Deploy to Vercel, configure custom domain
**Blocking:** Yes

1. Go to [vercel.com](https://vercel.com) → New Project → import from GitHub.
2. Set all production environment variables in Vercel Dashboard → Settings → Environment Variables.
3. Add custom domain `omniincubator.org` in Vercel Dashboard → Settings → Domains.

- [ ] Project imported into Vercel
- [ ] Production environment variables set
- [ ] Custom domain added in Vercel

---

### E12 — DNS: point omniincubator.org to Vercel
**Blocking:** Yes

Update DNS records at your domain registrar to point to Vercel's nameservers or IP addresses (Vercel provides the exact records during domain setup).

- [ ] DNS records updated
- [ ] Domain resolves to Vercel (allow up to 48 hours for propagation)

---

### E13 — Switch Stripe to live mode, update keys
**Blocking:** Yes for production

1. In Stripe Dashboard, switch to Live mode.
2. Get new live-mode API keys.
3. Update `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` in Vercel environment variables.
4. Re-create Stripe Products, Prices, and Webhook endpoint in live mode.
5. Update `STRIPE_MONTHLY_PRICE_ID` and `STRIPE_ANNUAL_PRICE_ID` with live mode Price IDs.

- [ ] Live mode API keys obtained
- [ ] Live mode products and prices created
- [ ] Live mode webhook endpoint configured
- [ ] Environment variables updated in Vercel

---

### E14 — Legal review: privacy policy, terms of service, sweepstakes rules
**Blocking:** Soft (placeholder pages exist; content must be filled before launch)

- [ ] Privacy policy content provided and added to `/privacy`
- [ ] Terms of service content provided and added to `/terms`
- [ ] Sweepstakes official rules reviewed by legal and added to `/sweepstakes/rules`

---

## Post-Deployment

### E15 — Create first sweepstake in admin dashboard
**Blocking:** Yes — **needed before launch** (sweepstake entries will not be awarded without an active sweepstake; entry badges and lead capture popup will not appear)

See the [Sweepstakes Operations runbook](sweepstakes-operations.md) for step-by-step instructions.

- [ ] First sweepstake created with title, prize description, start/end dates, non-purchase entry amount
- [ ] Official rules URL set (coordinate with E14 legal review)
- [ ] Sweepstake activated

---

### E16 — Upload first e-books via admin dashboard
**Blocking:** Yes — **needed before launch** (the library page is empty without at least one active e-book; entry badges and purchase entry awarding will not have products to attach to)

1. Navigate to `/admin/products` → New Product.
2. Fill in title, slug, description, pricing, and category.
3. On the edit page, upload a cover image and the main PDF (and optionally a preview PDF).
4. Toggle the product to active.

- [ ] At least one e-book uploaded with title, cover, price, and PDF
- [ ] Product marked active so it appears in `/library`

---

### E17 — Create first sample product via admin dashboard
**Blocking:** Yes — **needed before launch** (the `/free/[slug]` landing pages do not exist without at least one active sample product; lead capture from sample products is unavailable; `/sweepstakes` "Ways to enter" section will show no free resources)

1. Navigate to `/admin/sample-products` → New Sample Product.
2. Fill in title, slug, description. Slug must be lowercase alphanumeric with hyphens (e.g., `top-10-business-lessons`).
3. On the edit page, upload the PDF (→ `sample-products` bucket) and a cover image (→ `covers` bucket).
4. Configure lead capture fields: `require_phone` toggle, entry amount override (`custom_entry_amount` if different from the sweepstake default).
5. Set upsell products: link to a featured e-book and/or toggle `upsell_membership` to show the membership upsell on the download page.
6. Toggle the product to active.

The landing page is then live at `/free/{slug}`.

- [ ] Sample product created with title, slug, description
- [ ] PDF uploaded to `sample-products` bucket
- [ ] Cover image uploaded
- [ ] Lead capture fields configured
- [ ] Upsell products linked
- [ ] Product marked active
