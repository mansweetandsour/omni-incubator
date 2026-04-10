# Supabase Storage Buckets

Buckets cannot be created via SQL migration files. Create these manually via the
Supabase Dashboard (Storage section) or the Supabase Management API.

## Required Buckets

| Bucket Name      | Access  | Signed URL Required | Notes                              |
|------------------|---------|--------------------|------------------------------------|
| ebooks           | Private | Yes (1hr expiry)   | PDF/EPUB downloads — sign on demand |
| ebook-previews   | Public  | No                 | Free preview files                  |
| sample-products  | Private | Yes (1hr expiry)   | Free lead magnet downloads          |
| avatars          | Public  | No                 | User profile photos                 |
| covers           | Public  | No                 | E-book and product cover images     |

## CORS Configuration

Apply to all buckets:
- Allowed origins: `https://omniincubator.org`, `http://localhost:3000`
- Allowed methods: `GET, POST, PUT, DELETE`
- Allowed headers: `*`

## File Path Conventions

- Ebooks: `ebooks/{product-uuid}/{filename}.pdf`
- Ebook previews: `ebook-previews/{product-uuid}/preview.pdf`
- Sample products: `sample-products/{sample-product-uuid}/{filename}.pdf`
- Avatars: `avatars/{user-uuid}/avatar.{ext}`
- Covers: `covers/{product-uuid}/cover.{ext}`

## Signed URL Generation

For private buckets, generate signed URLs in API route handlers:
```typescript
const { data } = await adminClient.storage
  .from('ebooks')
  .createSignedUrl(filePath, 3600) // 1 hour expiry
```

Never store signed URLs in the database — they expire. Store the raw path and sign on demand.
