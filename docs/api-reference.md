# API Reference

All routes are under `/api`. Routes prefixed `/api/admin/` require an authenticated admin session (cookie-based auth; `profiles.role = 'admin'`).

---

## Auth

### `GET /api/auth/callback`

Google OAuth PKCE callback. Exchanges the authorization code for a session and redirects to the app. Managed by Supabase Auth.

---

## Admin — File Upload

### `POST /api/admin/sample-products/[id]/upload`

**Auth:** Admin only (cookie session + `profiles.role = 'admin'`). Returns 401 if unauthenticated, 403 if not admin.

Upload a PDF or cover image for a sample product. Accepts `multipart/form-data`.

**Form fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | The file to upload |
| `type` | string | Yes | `pdf` \| `cover` |

**Behavior by type:**

| `type` | Destination bucket | Max size | Accepted MIME | DB field updated |
|---|---|---|---|---|
| `pdf` | `sample-products` (private) | 100 MB | `application/pdf` | `sample_products.file_path` |
| `cover` | `covers` (public) | 20 MB | `image/jpeg`, `image/png`, `image/webp` | `sample_products.cover_image_url` |

**Response (200):**
```json
{ "path": "covers/sample-products/id/cover-filename.jpg", "url": "https://..." }
```
(`url` is present for `cover` type; absent for `pdf` uploads.)

**Error responses:** `400` (missing field, wrong type), `401`, `403`, `413` (file over size limit), `415` (wrong MIME), `500`.

---

### `GET /api/admin/sweepstakes/[id]/export`

**Auth:** Admin only (cookie session + `profiles.role = 'admin'`). Returns 401 if unauthenticated, 403 if not admin.

Export all sweepstake entries as a CSV file. Before querying, this route calls the `refresh_entry_verification` RPC to ensure the materialized view is current. Data is returned via the `export_sweepstake_entries` SECURITY DEFINER RPC (see ADR-011).

- `[id]` is the `sweepstakes.id` (UUID).

**Response (200):** `text/csv` with `Content-Disposition: attachment; filename="sweepstake-{id}-entries.csv"`.

**CSV columns:**

| Column | Description |
|---|---|
| `user_email` | Participant email from `profiles` |
| `display_name` | Display name from `profiles` |
| `total_entries` | Total entries across all sources |
| `purchase_entries` | Entries from e-book purchases and memberships |
| `non_purchase_entries` | Entries from confirmed lead captures |
| `admin_entries` | Entries from admin adjustments |
| `coupon_bonus_entries` | Entries from coupon bonuses |
| `list_price_basis_cents` | List price used for entry calculation (cents) |
| `amount_collected_cents` | Actual amount collected (cents) |
| `actual_order_total_cents` | Order total (cents) |

Rows are ordered by `total_entries DESC`.

**Error responses:** `401`, `403`, `500`.

---

### `POST /api/admin/ebooks/[id]/upload`

**Auth:** Admin only (cookie session + `profiles.role = 'admin'`). Returns 401 if unauthenticated, 403 if not admin.

Upload a file for an e-book product. Accepts `multipart/form-data`.

**Form fields:**

| Field | Type | Required | Description |
|---|---|---|---|
| `file` | File | Yes | The file to upload |
| `type` | string | Yes | `main` \| `preview` \| `cover` |

**Behavior by type:**

| `type` | Destination bucket | Max size | Accepted MIME | DB field updated |
|---|---|---|---|---|
| `main` | `ebooks` (private) | 100 MB | `application/pdf` | `ebooks.file_path` |
| `preview` | `ebook-previews` (public) | 100 MB | `application/pdf` | `ebooks.preview_file_path` |
| `cover` | `covers` (public) | 100 MB | `image/jpeg`, `image/png`, `image/webp` | `products.cover_image_url` |

**Response (200):**
```json
{ "path": "covers/product-id/cover-filename.jpg", "url": "https://..." }
```
(`url` is present for public buckets; absent for `main` uploads.)

**Error responses:** `400` (missing field, wrong type), `401`, `403`, `413` (file > 100 MB), `415` (wrong MIME), `500`.

---

## E-books — Public

### `GET /api/ebooks/[id]/preview`

**Auth:** None (public).

Returns a `307` redirect to the public CDN URL of the e-book's preview PDF.

- `[id]` is the `products.id` (UUID).
- Returns `404` if no matching product exists or `ebooks.preview_file_path` is null/empty.

---

## Checkout

### `POST /api/checkout/membership`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Create a Stripe Checkout Session for a membership subscription (monthly or annual). Returns 400 if the user already has an active or trialing subscription.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `plan` | string | Yes | `monthly` or `annual` |

**Response (200):**
```json
{ "url": "https://checkout.stripe.com/..." }
```

The client should redirect to `url`. The session includes a 7-day free trial, `allow_promotion_codes: true`, and Rewardful `client_reference_id` tracking if `NEXT_PUBLIC_REWARDFUL_API_KEY` is set.

**Error responses:** `400` (already subscribed, invalid plan), `401`, `500`.

---

### `POST /api/checkout/ebook`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Create a Stripe Checkout Session for an e-book one-time purchase. Member price (`stripe_member_price_id`) is used automatically if the user has an active or trialing subscription. Accepts an optional coupon code which is validated server-side before the session is created.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `ebookId` | string (UUID) | Yes | `products.id` |
| `couponCode` | string | No | Coupon code to apply (case-insensitive) |

**Response (200):**
```json
{ "url": "https://checkout.stripe.com/..." }
```

**Error responses:** `400` (invalid coupon, product not found), `401`, `500`.

---

### `POST /api/checkout/ebook-with-membership`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Create a combined Stripe Checkout Session that purchases an e-book and starts a membership subscription in a single session. Used when the user opts in to the membership upsell on the library detail page.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `ebookId` | string (UUID) | Yes | `products.id` |
| `plan` | string | Yes | `monthly` or `annual` |

**Response (200):**
```json
{ "url": "https://checkout.stripe.com/..." }
```

**Error responses:** `400`, `401`, `500`.

---

## Coupons

### `POST /api/coupons/validate`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Validate a coupon code. Checks: exists, `is_active = true`, not expired (`expires_at`), global usage limit not reached, per-user usage limit not reached. Lookup is case-insensitive.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `code` | string | Yes | Coupon code entered by the user |

**Response (200) — valid:**
```json
{
  "valid": true,
  "coupon": { "id": "uuid", "entry_type": "percent", "entry_value": 20, "code": "SAVE20" }
}
```

**Response (200) — invalid:**
```json
{ "valid": false, "message": "Coupon has expired" }
```

**Error responses:** `401`, `500`.

---

## Webhooks

### `POST /api/webhooks/stripe`

**Auth:** None (Stripe signature verification via `STRIPE_WEBHOOK_SECRET`). Returns 400 on invalid signature.

Idempotent Stripe webhook handler. Processes the following events:

| Event | Effect |
|---|---|
| `checkout.session.completed` (payment) | INSERT order + order_items + user_ebooks; send ebook purchase email; award sweepstake entries (non-fatal) |
| `checkout.session.completed` (subscription/combined) | INSERT order + order_items + user_ebooks + UPSERT subscriptions; award ebook sweepstake entries, set `entries_awarded_by_checkout=true` |
| `customer.subscription.created` | UPSERT subscriptions; send membership welcome email; subscribe to Beehiiv |
| `customer.subscription.updated` | UPDATE subscriptions |
| `customer.subscription.deleted` | SET subscriptions.status = canceled; unsubscribe from Beehiiv |
| `customer.subscription.trial_will_end` | Send trial ending email |
| `invoice.paid` | UPDATE subscriptions.status = active; INSERT renewal order; send membership charged email; award renewal sweepstake entries (skipped if combined-checkout order exists) |
| `invoice.payment_failed` | UPDATE subscriptions.status = past_due; send payment failed email |

Idempotency is enforced via the `claim_stripe_event` Postgres RPC (see ADR-007). Duplicate event deliveries return 200 immediately without side effects.

**Important:** This route reads the request body as raw text (`request.text()`) to preserve the exact bytes required for Stripe signature verification. Next.js App Router Route Handlers do not apply a body parser, so no middleware configuration is needed.

**Response (200):**
```json
{ "received": true }
```

**Error responses:** `400` (invalid signature or missing webhook secret).

---

## Profile

### `GET /api/profile/orders`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Paginated order history for the authenticated user, with nested order line items.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number (1-indexed). Page size is 20. |

**Response (200):**
```json
{
  "orders": [{ "id": "uuid", "created_at": "...", "total_cents": 1500, "order_items": [...] }],
  "hasMore": false,
  "total": 3
}
```

---

### `GET /api/profile/ebooks`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Deduplicated list of e-books owned by the authenticated user, with product metadata (title, cover, slug, authors).

**Response (200):**
```json
[{ "ebook_id": "uuid", "title": "...", "cover_image_url": "...", "slug": "..." }]
```

---

### `GET /api/profile/subscription`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Current subscription for the authenticated user, or `null` if no subscription exists.

**Response (200) — active subscription:**
```json
{
  "id": "uuid",
  "status": "trialing",
  "trial_end": "2026-04-16T00:00:00Z",
  "current_period_end": "2026-05-09T00:00:00Z",
  "cancel_at_period_end": false,
  "product": { "title": "Omni Membership — Monthly" }
}
```

**Response (200) — no subscription:**
```json
null
```

---

## Sample Products — Public

### `GET /api/sample-products/[slug]/download`

**Auth:** None (public). Requires a `?token=` query parameter.

Token-based download for sample product PDFs. The token is the `lead_captures.confirmation_token` UUID from the confirmation email link. The token must belong to a confirmed lead capture (`confirmed_at IS NOT NULL`) that matches the sample product identified by `[slug]`.

**Query parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `token` | string (UUID) | Yes | Confirmation token from the email link or download page URL |

**Response:** `307` redirect to a 1-hour Supabase Storage signed URL.

**Error responses:**

| Status | Condition |
|---|---|
| `400` | `token` query parameter missing |
| `403` | Token found but `confirmed_at IS NULL` (not confirmed) |
| `403` | Token belongs to a different sample product (`token/product mismatch`) |
| `404` | Token not found in `lead_captures` |
| `404` | Sample product not found for the given slug |
| `500` | Storage signed URL generation failed |

---

## E-books — Protected

### `GET /api/ebooks/[id]/download`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated, 403 if user does not own the e-book.

Ownership check, then returns a `307` redirect to a 1-hour signed Supabase Storage URL for the e-book PDF. Atomically increments `user_ebooks.download_count` and updates `last_downloaded_at` as a non-blocking side effect.

- `[id]` is the `products.id` (UUID).

**Response:** `307` redirect to signed URL.

**Error responses:** `401`, `403` (not owned), `404` (product not found), `500`.

---

## Subscription Management

### `POST /api/subscription/portal`

**Auth:** Cookie session (logged-in user). Returns 401 if unauthenticated.

Create a Stripe Billing Portal session for the authenticated user. The user is redirected to Stripe's hosted portal where they can update payment methods, switch plans, or cancel. After completing actions in the portal, Stripe redirects back to `/profile/subscription`.

**Request body:** None required.

**Response (200):**
```json
{ "url": "https://billing.stripe.com/session/..." }
```

**Error responses:** `400` (no Stripe customer ID on profile), `401`, `500`.

---

## Lead Capture

### `POST /api/lead-capture`

**Auth:** None (public). Rate-limited to 5 requests per IP per hour via Upstash Redis. Rate limiting is skipped if `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are not set.

Submit an email address for the active sweepstake lead capture. Creates a `lead_captures` row with `confirmed_at=NULL` and `entry_awarded=false`, and sends a confirmation email. Entries are not awarded until the token in the confirmation email is validated (see ADR-010).

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Email address to capture |
| `source` | string | No | Source identifier (e.g., `popup`, `marketplace_coming_soon`, `sample_product`). Defaults to `popup`. |
| `sampleProductId` | string (UUID) | No | Required when `source = 'sample_product'`. Used to construct the post-confirm download redirect. |

**Response (200) — new submission:**
```json
{ "success": true }
```

**Response (200) — duplicate (same email + sweepstake):**
```json
{ "duplicate": true, "message": "You've already entered" }
```

**Error responses:** `400` (no active sweepstake, invalid input), `429` (rate limit), `500`.

---

### `POST /api/lead-capture/confirm`

**Auth:** None (public, token-authenticated).

Validate a confirmation token, mark the lead as confirmed, and award sweepstake entries. The token is the UUID stored in `lead_captures.confirmation_token`.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string (UUID) | Yes | Confirmation token from the email link |

**Response (200) — confirmed, entries awarded:**
```json
{
  "success": true,
  "entries": 10,
  "source": "popup",
  "sweepstake": {
    "title": "Spring Sweepstakes",
    "prize_description": "...",
    "end_at": "2026-06-01T00:00:00Z"
  },
  "activeMultiplier": 2.0
}
```

**Response (200) — already confirmed:**
```json
{ "alreadyConfirmed": true, "entries": 10, "source": "popup" }
```

**Response (200) — sample product redirect:**
```json
{ "redirect": "/free/{slug}/download?token={token}" }
```
(Returned when `source = 'sample_product'`; client should `router.replace(redirect)`.)

**Response (410) — token expired (> 72 hours):**
```json
{ "error": "Token expired", "email": "user@example.com" }
```

**Error responses:** `404` (token not found / already confirmed with no entries), `410` (expired), `500`.

---

### `POST /api/lead-capture/resend`

**Auth:** None (public). Rate-limited via Upstash (1 per email per 5 minutes) and a DB-level guard that enforces the same cooldown when Upstash is not configured.

Regenerate the confirmation token and resend the confirmation email to a pending (unconfirmed) lead.

**Request body (JSON):**

| Field | Type | Required | Description |
|---|---|---|---|
| `email` | string | Yes | Email address of the pending lead |

**Response (200):**
```json
{ "success": true }
```

**Error responses:** `404` (no pending unconfirmed lead for this email), `429` (resent within last 5 minutes), `500`.

---

## Server Actions — Services (Phase 5)

These are Next.js Server Actions (not HTTP API routes). They are called directly from client components via the Server Action binding. Auth is enforced server-side.

### `approveService(id: string)`

**File:** `src/app/actions/services.ts`
**Auth:** Admin only — calls `getAdminUser()` internally; returns `{ error: string }` if the caller is not an admin.

Sets `services.status = 'approved'` for the given service UUID. Called by `<ServiceApproveButton>` on the admin services list (`/admin/services`) for rows with `status='pending'`.

**Returns:**
- `{ ok: true }` — on success; also calls `revalidatePath('/admin/services')`
- `{ error: string }` — on auth failure or DB error

### `updateService(formData: FormData)` — extended in Phase 5

**File:** `src/app/actions/services.ts`

Extended to read and persist `custom_entry_amount` (integer, optional, must be ≥ 1 if provided). Validates the value before writing. Revalidates `/admin/services` and `/marketplace` on success.

---

## Library

### `GET /api/library/products`

**Auth:** None (public).

Paginated, filtered product listing. Used by the Load More button on `/library`.

**Query parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | integer | `1` | Page number (1-indexed). Page size is 12. |
| `q` | string | — | Keyword search against title, description, and tags (case-insensitive). |
| `category` | string (comma-separated) | — | Filter by `ebooks.category`. Multiple values are OR'd. |
| `operator_dependency` | string (comma-separated) | — | Filter by `ebooks.operator_dependency`. |
| `scale_potential` | string (comma-separated) | — | Filter by `ebooks.scale_potential`. |
| `cost_to_start` | string (comma-separated) | — | Filter by `ebooks.cost_to_start`. |
| `sort` | string | `newest` | `newest` \| `price_asc` \| `price_desc` \| `title_asc` |

Only returns products where `is_active = true AND deleted_at IS NULL AND type = 'ebook'`.

**Response (200):**
```json
{
  "products": [...],
  "hasMore": true,
  "total": 42
}
```

`total` reflects the DB-filtered count (title/description ILIKE). Tag filtering is applied in JS; the count may be slightly overstated when tag filters are active. See ADR note in `BACKEND_DONE.md`.
