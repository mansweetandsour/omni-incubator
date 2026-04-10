# Pre-Launch Checklist

Use this checklist before every production launch or significant release. Check off each item and investigate any failures before proceeding.

---

## Auth

- [ ] New user registration flow completes without errors (email/password and magic link)
- [ ] Email confirmation link works and redirects to the correct page
- [ ] Existing user login succeeds and session is persisted across page refreshes
- [ ] Logout clears the session and redirects to the home page
- [ ] Unauthenticated access to `/profile/*` routes redirects to `/login`
- [ ] Admin routes (`/admin/*`) are inaccessible to non-admin users

---

## E-books

- [ ] Active e-books appear in the library page grid
- [ ] Individual e-book detail page loads with correct title, description, and cover image
- [ ] Member discount (50% off) is applied correctly to the displayed price for logged-in members
- [ ] Inactive or deleted e-books do not appear in the library or sitemap
- [ ] `generateMetadata` on `/library/[slug]` returns correct OG title and image

---

## Checkout

- [ ] Stripe checkout session is created successfully for a one-time e-book purchase
- [ ] Stripe checkout session is created successfully for a membership subscription
- [ ] Checkout failure (e.g. test card decline) shows toast error message to the user
- [ ] Checkout success redirects to the correct confirmation page
- [ ] Test card `4000000000000002` (declined) triggers the error toast
- [ ] Stripe test mode is confirmed active before launch (`STRIPE_SECRET_KEY` starts with `sk_test_`)

---

## Webhooks

- [ ] Stripe webhook endpoint `/api/webhooks/stripe` responds with `200 OK` to test events
- [ ] `checkout.session.completed` event creates the expected order record in Supabase
- [ ] `customer.subscription.created` event activates the user's subscription
- [ ] `customer.subscription.deleted` event deactivates the user's subscription
- [ ] Webhook signature verification is enabled (`STRIPE_WEBHOOK_SECRET` is set)
- [ ] Webhook `maxDuration` is set to 60 seconds in `vercel.json`

---

## Downloads

- [ ] Purchased e-book appears in the user's `/profile/ebooks` page after successful checkout
- [ ] Download link for a purchased e-book is accessible and serves the correct file
- [ ] Download link for an unpurchased e-book is blocked (returns 403 or redirect)
- [ ] Signed URL expiry is configured correctly (not indefinite)

---

## Profile

- [ ] Profile page loads for authenticated users without errors
- [ ] Profile display name and avatar can be updated successfully
- [ ] Profile pages (`/profile/*`) have `robots: noindex` meta tag
- [ ] My Orders page shows all historical orders for the user
- [ ] My Entries page shows sweepstake entries with correct counts

---

## Sweepstakes

- [ ] Active sweepstake is displayed on the `/sweepstakes` page
- [ ] Free entry form (no purchase required) submits successfully and creates an entry
- [ ] Sweepstake entry count increments correctly after a purchase
- [ ] Sweepstakes rules page (`/sweepstakes/rules`) is accessible
- [ ] Inactive or ended sweepstakes do not appear on the public page

---

## Sample Product

- [ ] Sample products appear on the `/free` or marketplace route
- [ ] Individual sample product page loads at `/free/[slug]`
- [ ] Lead capture form submits correctly and creates a `lead_submissions` record
- [ ] Confirmation email is sent after lead form submission (if configured)
- [ ] Inactive sample products are excluded from the sitemap

---

## Admin

- [ ] Admin dashboard loads for users with the `admin` role
- [ ] Product creation form saves a new product to the database
- [ ] Product status can be toggled between active and inactive
- [ ] Sweepstake can be created and set to active status
- [ ] User list loads and shows all registered users
- [ ] Admin sidebar navigation works on both desktop and mobile (hamburger menu)

---

## Emails

- [ ] Transactional emails are sent via Resend (not a test domain)
- [ ] Order confirmation email is received after successful checkout
- [ ] Welcome email is sent to new registered users (if configured)
- [ ] Email domain is verified in Resend dashboard
- [ ] No emails are being sent from a sandbox or test mode address in production
- [ ] Unsubscribe links are present in all marketing emails (Beehiiv newsletter)
