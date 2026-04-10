# SPEC.md — Phase 5: Marketplace Shell
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 5 — Marketplace Shell

---

## 1. Overview

Phase 5 adds three pieces of functionality on top of the existing marketplace foundation (Phase 2):

1. **Service detail page** — `/marketplace/[slug]` with Coming Soon overlay, rate display, Markdown long description, provider info, entry badge, and inline waitlist form.
2. **Entry badges on marketplace cards** — update `/marketplace` page to show `EntryBadge` on cards with `custom_entry_amount`.
3. **Admin service approval workflow** — add status filter + Approve quick-action to services list; augment service edit form with corrected status options, status badge, and `custom_entry_amount` field; extend `updateService` action; add `approveService` action.

One new DB migration is required (`custom_entry_amount` on `services` table). Two pre-existing Phase 2 bugs are fixed as part of this phase (`service_rate_type` enum mismatch in `ServiceForm`, `formatRate` incomplete in `ServiceTable`).

---

## 2. Stack and Libraries

No new npm packages required. All dependencies are already installed.

| Purpose | Package | Status |
|---|---|---|
| Markdown rendering | `react-markdown` v10.1.0 + `remark-gfm` v4.0.1 | Already installed (Phase 4B) |
| UI components | shadcn/ui (`Badge`, `Button`, `Card`) | Already installed |
| Supabase admin client | `@/lib/supabase/admin` | Already installed |
| Toast notifications | `sonner` | Already installed |
| Prose CSS utility | `globals.css` — `.prose` class | Already added (Phase 4B) |

---

## 3. New Migration

**File:** `supabase/migrations/20240101000019_services_custom_entry_amount.sql`

```sql
-- Phase 5: Marketplace Shell — add custom_entry_amount to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS custom_entry_amount INTEGER;
```

No index required. No seed data. No RLS changes — the column inherits existing service RLS.

---

## 4. Bug Fixes (Applied as Part of This Phase)

### BF-1: `service_rate_type` enum mismatch in `ServiceForm`

**File:** `src/components/admin/service-form.tsx`

Current select options: `hourly`, `project`, `retainer`, `custom`.
DB enum `service_rate_type`: `hourly`, `fixed`, `monthly`, `custom`.

Fix: replace `project` → `fixed` (label "Fixed"), `retainer` → `monthly` (label "Monthly").
The `rateType` state initializer `useState(service?.rate_type ?? 'hourly')` is correct — no change.

### BF-2: `formatRate` incomplete in `ServiceTable`

**File:** `src/components/admin/service-table.tsx`

Replace the existing `formatRate` function with:

```typescript
function formatRate(service: Service): string {
  if (service.rate_label) return service.rate_label
  if (service.rate_type === 'custom' || service.rate_cents == null) return 'Custom'
  const amount = `$${(service.rate_cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
  if (service.rate_type === 'hourly') return `${amount}/hr`
  if (service.rate_type === 'fixed') return `${amount} fixed`
  if (service.rate_type === 'monthly') return `${amount}/mo`
  return amount
}
```

---

## 5. API Contracts

No new API routes. All mutations use Server Actions.

---

## 6. Server Actions

### Modified: `src/app/actions/services.ts`

**`updateService(id, formData)` — extend to handle `custom_entry_amount`:**

Add after the `is_coming_soon` extraction:
```typescript
const cea_str = formData.get('custom_entry_amount')?.toString()
let custom_entry_amount: number | null = null
if (cea_str && cea_str.trim() !== '') {
  const ceaParsed = parseInt(cea_str, 10)
  if (isNaN(ceaParsed) || ceaParsed < 1) return { error: 'Entry amount must be a positive integer' }
  custom_entry_amount = ceaParsed
}
```

Add `custom_entry_amount` to the `adminClient.update({...})` object.

Also add `import { revalidatePath } from 'next/cache'` if not already imported. Currently `updateService` does not call `revalidatePath` — add `revalidatePath('/admin/services')` and `revalidatePath('/marketplace')` after the update to keep public marketplace ISR fresh.

**New export: `approveService`:**

```typescript
export async function approveService(id: string): Promise<{ ok: true } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const { error } = await adminClient
    .from('services')
    .update({ status: 'approved' })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/admin/services')
  return { ok: true }
}
```

---

## 7. Component Specifications

### New: `src/components/marketplace/ServiceWaitlistCTA.tsx`

```typescript
'use client'
// Props: none
```

Internal state: `const [showForm, setShowForm] = useState(false)`.

Renders:
1. `<Button onClick={() => setShowForm(true)} variant="outline" className="...">Coming Soon — Join the waitlist</Button>` — always visible.
2. When `showForm === true`: render `<LeadCaptureForm source="marketplace_coming_soon" />` below the button.

Import `LeadCaptureForm` from `'@/components/sweepstakes/LeadCapturePopup'`.
Import `Button` from `'@/components/ui/button'`.
Import `useState` from `'react'`.

### New: `src/components/marketplace/ServiceApproveButton.tsx`

```typescript
'use client'
// Props: { serviceId: string }
```

```typescript
import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { approveService } from '@/app/actions/services'

export function ServiceApproveButton({ serviceId }: { serviceId: string }) {
  const [isPending, startTransition] = useTransition()
  function handleApprove() {
    startTransition(async () => {
      const result = await approveService(serviceId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Service approved')
      }
    })
  }
  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleApprove}>
      {isPending ? 'Approving…' : 'Approve'}
    </Button>
  )
}
```

### Modified: `src/components/admin/service-form.tsx`

1. Add `custom_entry_amount: number | null` to the `Service` interface.
2. Fix rate type select options (BF-1): change `<option value="project">Project</option>` → `<option value="fixed">Fixed</option>` and `<option value="retainer">Retainer</option>` → `<option value="monthly">Monthly</option>`.
3. Status section (edit mode): add color badge above the select showing current status. Badge colors by status value:
   - `pending` → `className="bg-amber-100 text-amber-800 border-amber-200"`
   - `approved` → `className="bg-blue-100 text-blue-800 border-blue-200"`
   - `active` → `className="bg-green-100 text-green-800 border-green-200"`
   - `suspended` → `className="bg-red-100 text-red-800 border-red-200"`
   - default → `variant="secondary"`
   Place: `<div className="flex items-center gap-2 mb-1"><label...>Status</label><Badge className={statusColor}>{service.status ?? 'pending'}</Badge></div>`.
4. Status select options: replace `pending / active / paused` with `pending / approved / active / suspended`.
5. Add `custom_entry_amount` input field after the Tags section:
   ```tsx
   <div className="space-y-1">
     <label className="text-sm font-medium" htmlFor="custom_entry_amount">
       Entry Amount <span className="text-xs text-zinc-400">(optional — overrides default entry calculation)</span>
     </label>
     <Input
       id="custom_entry_amount"
       name="custom_entry_amount"
       type="number"
       min="1"
       defaultValue={service?.custom_entry_amount ?? ''}
       placeholder="e.g. 50"
     />
   </div>
   ```

### Modified: `src/components/admin/service-table.tsx`

1. Fix `formatRate()` — BF-2.
2. Add `ServiceApproveButton` import: `import { ServiceApproveButton } from '@/components/marketplace/ServiceApproveButton'`.
3. In the actions `<TableCell>`, add before the Archive button:
   ```tsx
   {!isArchived && service.status === 'pending' && (
     <ServiceApproveButton serviceId={service.id} />
   )}
   ```

### Modified: `src/app/(admin)/admin/services/page.tsx`

```typescript
interface AdminServicesPageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminServicesPage({ searchParams }: AdminServicesPageProps) {
  const { status: statusFilter } = await searchParams

  let query = adminClient
    .from('services')
    .select('id, title, category, rate_type, rate_cents, rate_label, status, is_coming_soon, deleted_at')
    .order('created_at', { ascending: false })

  if (statusFilter === 'pending') {
    query = query.eq('status', 'pending').is('deleted_at', null)
  } else if (statusFilter === 'active') {
    query = query.eq('status', 'active').is('deleted_at', null)
  }

  const { data: services } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={buttonVariants()}>New Service</Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2">
        <Link href="/admin/services" className={buttonVariants({ variant: !statusFilter ? 'default' : 'outline', size: 'sm' })}>All</Link>
        <Link href="/admin/services?status=pending" className={buttonVariants({ variant: statusFilter === 'pending' ? 'default' : 'outline', size: 'sm' })}>Pending Approval</Link>
        <Link href="/admin/services?status=active" className={buttonVariants({ variant: statusFilter === 'active' ? 'default' : 'outline', size: 'sm' })}>Active</Link>
      </div>

      {services && services.length > 0 ? (
        <ServiceTable services={services} />
      ) : (
        <p className="text-zinc-500">No services found.</p>
      )}
    </div>
  )
}
```

---

## 8. Page Specifications

### New: `src/app/marketplace/[slug]/page.tsx`

```typescript
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { adminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { EntryBadge } from '@/components/sweepstakes/EntryBadge'
import { ServiceWaitlistCTA } from '@/components/marketplace/ServiceWaitlistCTA'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const revalidate = 60

interface ServiceDetailPageProps {
  params: Promise<{ slug: string }>
}

function formatServiceRate(service: {
  rate_type: string
  rate_cents: number | null
  rate_label: string | null
}): string {
  if (service.rate_label) return service.rate_label
  if (service.rate_type === 'custom' || service.rate_cents == null) return 'Contact for pricing'
  const amt = (service.rate_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (service.rate_type === 'hourly') return `${amt}/hr`
  if (service.rate_type === 'fixed') return `${amt} fixed`
  if (service.rate_type === 'monthly') return `${amt}/mo`
  return amt
}

export async function generateMetadata({ params }: ServiceDetailPageProps) {
  const { slug } = await params
  const { data: service } = await adminClient
    .from('services')
    .select('title, description')
    .eq('slug', slug)
    .maybeSingle()
  if (!service) return { title: 'Service Not Found' }
  return {
    title: service.title,
    description: service.description ?? '',
  }
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params

  const { data: service } = await adminClient
    .from('services')
    .select('*, profiles!provider_id(display_name)')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!service) notFound()
  if (service.status !== 'active' && service.status !== 'approved') notFound()

  const providerName =
    (service.profiles as { display_name: string } | null)?.display_name ?? null

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="relative">
        {/* Page content */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">{service.title}</h1>
          {providerName && (
            <p className="text-sm text-zinc-500">By {providerName}</p>
          )}
          <p className="text-lg font-semibold">{formatServiceRate(service)}</p>
          {service.description && (
            <p className="text-zinc-600 dark:text-zinc-400">{service.description}</p>
          )}
          {service.custom_entry_amount != null && service.custom_entry_amount > 0 && (
            <Suspense fallback={null}>
              <EntryBadge
                product={{ price_cents: 0, custom_entry_amount: service.custom_entry_amount }}
              />
            </Suspense>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{service.category}</Badge>
            {service.tags?.map((tag: string) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>
          {service.long_description && (
            <div className="prose prose-zinc max-w-none dark:prose-invert mt-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {service.long_description}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Coming Soon overlay */}
        {service.is_coming_soon && (
          <div className="absolute inset-0 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4 rounded-lg p-8 text-center">
            <Badge variant="outline" className="text-sm">Coming Soon</Badge>
            <h2 className="text-xl font-semibold">This service is launching soon</h2>
            <p className="text-sm text-zinc-500 max-w-xs">
              Join the waitlist to be notified when this service becomes available.
            </p>
            <ServiceWaitlistCTA />
          </div>
        )}
      </div>
    </div>
  )
}
```

**Note on PostgREST join:** `.select('*, profiles!provider_id(display_name)')` — this uses the FK from `services.provider_id → profiles.id`. The `profiles` alias in the result will be `{ display_name: string } | null` for a single FK join. Cast accordingly.

### Modified: `src/app/marketplace/page.tsx`

Changes:
1. Update select to include `custom_entry_amount` and `slug`.
2. Add `Suspense` import, `EntryBadge` import.
3. Add entry badge on cards (guarded by null check).
4. Wrap cards with `<Link href={/marketplace/${service.slug}}>` for navigation.

The full updated file:

```typescript
import { Suspense } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { LeadCaptureForm } from '@/components/sweepstakes/LeadCapturePopup'
import { EntryBadge } from '@/components/sweepstakes/EntryBadge'

export const revalidate = 60

export default async function MarketplacePage() {
  const supabase = await createClient()

  const { data: services } = await supabase
    .from('services')
    .select('id, slug, title, description, category, is_coming_soon, custom_entry_amount')
    .is('deleted_at', null)
    .in('status', ['active', 'approved'])
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-16 px-4">
      {/* Hero */}
      <div className="text-center mb-16">
        <Badge variant="outline" className="mb-4 text-sm">Coming Soon</Badge>
        <h1 className="text-4xl font-bold tracking-tight">Service Marketplace</h1>
        <p className="mt-4 text-lg text-zinc-500 max-w-xl mx-auto">
          A curated marketplace of vetted service providers to help you build, scale, and operate
          your business. Launching soon.
        </p>
      </div>

      {/* Service cards */}
      {services && services.length > 0 && (
        <div className="mb-16">
          <h2 className="text-xl font-bold mb-6">Available Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/marketplace/${service.slug}`}
                className="rounded-lg border bg-white dark:bg-zinc-900 p-6 space-y-3 hover:border-zinc-400 transition-colors block"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{service.title}</h3>
                  {service.is_coming_soon && (
                    <Badge variant="outline" className="shrink-0 text-xs">Coming Soon</Badge>
                  )}
                </div>
                {service.description && (
                  <p className="text-sm text-zinc-500 line-clamp-3">{service.description}</p>
                )}
                {service.custom_entry_amount != null && service.custom_entry_amount > 0 && (
                  <Suspense fallback={null}>
                    <EntryBadge
                      product={{ price_cents: 0, custom_entry_amount: service.custom_entry_amount }}
                    />
                  </Suspense>
                )}
                <Badge variant="secondary" className="text-xs">{service.category}</Badge>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Email capture */}
      <div className="max-w-md mx-auto rounded-lg border bg-white dark:bg-zinc-900 p-8">
        <h2 className="text-xl font-bold mb-2 text-center">Get notified when we launch</h2>
        <p className="text-sm text-zinc-500 mb-6 text-center">
          Be the first to know when the marketplace opens.
        </p>
        <LeadCaptureForm source="marketplace_coming_soon" />
      </div>
    </div>
  )
}
```

Note: The marketplace page now filters to show only `status IN ('active', 'approved')` services — previously it showed all non-deleted services. This is correct per the PRD (only visible services show).

---

## 9. TypeScript Type Notes

- `service.profiles` from the `profiles!provider_id(display_name)` join will be typed by Supabase as `{ display_name: string } | null` — cast with `as { display_name: string } | null`.
- `service.custom_entry_amount` is `number | null` after migration.
- `service.tags` is `string[] | null` — use optional chaining `service.tags?.map(...)`.
- `service.status` is `string | null` — the null check `service.status !== 'active' && service.status !== 'approved'` correctly catches null (404).

---

## 10. Auth Strategy

| Route / Action | Auth Method |
|---|---|
| `GET /marketplace/[slug]` | Public — no auth |
| `GET /marketplace` | Public — no auth |
| `approveService` Server Action | `createClient()` + profile `role='admin'` |
| `updateService` extension | Already protected |
| All `/admin/services` pages | Middleware: session + role='admin' |

---

## 11. Caching and Revalidation

| Route | Strategy |
|---|---|
| `/marketplace/[slug]` | `export const revalidate = 60` |
| `/marketplace` | `export const revalidate = 60` (unchanged) |
| Admin pages | `revalidatePath('/admin/services')` in `approveService` |
| `updateService` | Add `revalidatePath('/admin/services')` + `revalidatePath('/marketplace')` |

---

## 12. File Structure Summary

### New Files
```
supabase/migrations/20240101000019_services_custom_entry_amount.sql
src/app/marketplace/[slug]/page.tsx
src/components/marketplace/ServiceWaitlistCTA.tsx
src/components/marketplace/ServiceApproveButton.tsx
```

### Modified Files
```
src/app/marketplace/page.tsx
src/app/(admin)/admin/services/page.tsx
src/app/actions/services.ts
src/components/admin/service-form.tsx
src/components/admin/service-table.tsx
```

---

## 13. Non-Functional Requirements

- **TypeScript:** All files follow `await params`/`await searchParams` pattern. No `any` types.
- **Build safety:** `npx tsc --noEmit` 0 errors; `npm run build` exits 0.
- **ISR:** `/marketplace/[slug]` uses `revalidate = 60`. `generateMetadata` uses the same admin client — this is correct (server-only, no auth context needed for public data).
- **404 correctness:** `notFound()` from `'next/navigation'`.
- **Coming Soon overlay:** Content renders beneath the overlay — not conditionally omitted. This ensures the ISR page always renders something meaningful.
- **Entry badge null safety:** Always guard `custom_entry_amount != null && custom_entry_amount > 0`.
- **Marketplace page status filter:** The public marketplace now only shows `status IN ('active', 'approved')` services — this is an improvement over the Phase 2 implementation that showed all non-deleted services. The admin list still shows all statuses (with filter).
