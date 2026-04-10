# API Reference

All routes are under `/api`. Routes prefixed `/api/admin/` require an authenticated admin session (cookie-based auth; `profiles.role = 'admin'`).

---

## Auth

### `GET /api/auth/callback`

Google OAuth PKCE callback. Exchanges the authorization code for a session and redirects to the app. Managed by Supabase Auth.

---

## Admin — File Upload

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
