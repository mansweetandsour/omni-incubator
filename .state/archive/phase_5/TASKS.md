# TASKS.md — Phase 5: Marketplace Shell
**Architect Agent Output**
**Date:** 2026-04-09
**Phase:** 5 — Marketplace Shell

Tasks are ordered by dependency. Backend tasks must complete before Frontend tasks that depend on them.

---

## [BACKEND] Tasks

### B1 — New Migration: Add `custom_entry_amount` to `services` table

**File:** `supabase/migrations/20240101000019_services_custom_entry_amount.sql`

Create this file with:
```sql
-- Phase 5: Marketplace Shell — add custom_entry_amount to services
ALTER TABLE public.services ADD COLUMN IF NOT EXISTS custom_entry_amount INTEGER;
```

This is a no-op if column already exists. No seed data. No RLS changes.

**Verification:** File exists and contains the ALTER TABLE statement.

---

### B2 — Extend `updateService` Server Action to handle `custom_entry_amount` and add `revalidatePath`

**File:** `src/app/actions/services.ts`

1. Add `import { revalidatePath } from 'next/cache'` at the top of the file if not already present. (Check: currently the file does not import `revalidatePath`.)

2. In `updateService`, after the `is_coming_soon` extraction (line ~117), add:
```typescript
const cea_str = formData.get('custom_entry_amount')?.toString()
let custom_entry_amount: number | null = null
if (cea_str && cea_str.trim() !== '') {
  const ceaParsed = parseInt(cea_str, 10)
  if (isNaN(ceaParsed) || ceaParsed < 1) return { error: 'Entry amount must be a positive integer' }
  custom_entry_amount = ceaParsed
}
```

3. Add `custom_entry_amount` to the `adminClient.update({...})` object (after `is_coming_soon`).

4. After the update succeeds (before `return { ok: true }`), add:
```typescript
revalidatePath('/admin/services')
revalidatePath('/marketplace')
```

**Verification:** `updateService` with `custom_entry_amount='50'` in FormData updates the DB and both paths are revalidated.

---

### B3 — Add `approveService` Server Action

**File:** `src/app/actions/services.ts`

Add as a new export after `archiveService`:

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

`revalidatePath` is already imported from task B2.

**Verification:** Function exported, TypeScript compiles.

---

## [FRONTEND] Tasks

### F1 — New Component: `ServiceApproveButton`

**File:** `src/components/marketplace/ServiceApproveButton.tsx` (NEW — create directory if needed)

Create the full file per SPEC.md Section 7. It is a `'use client'` component that calls `approveService` via `useTransition`.

```typescript
'use client'

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

**Verification:** File exists, TypeScript compiles, no lint errors.

---

### F2 — New Component: `ServiceWaitlistCTA`

**File:** `src/components/marketplace/ServiceWaitlistCTA.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LeadCaptureForm } from '@/components/sweepstakes/LeadCapturePopup'

export function ServiceWaitlistCTA() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {!showForm && (
        <Button
          onClick={() => setShowForm(true)}
          variant="default"
          className="w-full"
        >
          Coming Soon — Join the waitlist
        </Button>
      )}
      {showForm && (
        <div className="w-full">
          <LeadCaptureForm source="marketplace_coming_soon" />
        </div>
      )}
    </div>
  )
}
```

**Verification:** File exists, TypeScript compiles.

---

### F3 — Fix `ServiceForm`: rate type options, status options, status badge, `custom_entry_amount` field

**File:** `src/components/admin/service-form.tsx`

**3a. Fix `Service` interface** — add `custom_entry_amount: number | null`:
```typescript
interface Service {
  // ... existing fields ...
  custom_entry_amount: number | null  // ADD THIS
}
```

**3b. Fix rate type select options** (around line 143–148):
Replace:
```tsx
<option value="project">Project</option>
<option value="retainer">Retainer</option>
```
With:
```tsx
<option value="fixed">Fixed</option>
<option value="monthly">Monthly</option>
```

**3c. Fix status select options** (around line 220–228):
Replace:
```tsx
<option value="pending">Pending</option>
<option value="active">Active</option>
<option value="paused">Paused</option>
```
With:
```tsx
<option value="pending">Pending</option>
<option value="approved">Approved</option>
<option value="active">Active</option>
<option value="suspended">Suspended</option>
```

**3d. Add status badge** — in the status section (edit mode), add a color Badge above the select. Replace the label div:
```tsx
{isEdit && (
  <div className="space-y-1">
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium" htmlFor="status">Status</label>
      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
        service.status === 'approved' ? 'bg-blue-100 text-blue-800 border-blue-200' :
        service.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
        service.status === 'suspended' ? 'bg-red-100 text-red-800 border-red-200' :
        'bg-amber-100 text-amber-800 border-amber-200'
      }`}>
        {service.status ?? 'pending'}
      </span>
    </div>
    <select ... >
```

**3e. Add `custom_entry_amount` input** — add after the Tags section and before the Status section:
```tsx
{/* Custom Entry Amount */}
<div className="space-y-1">
  <label className="text-sm font-medium" htmlFor="custom_entry_amount">
    Entry Amount <span className="text-xs text-zinc-400">(optional)</span>
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

**Verification:** Form renders with correct options. TypeScript compiles. Saving a service with `rate_type='fixed'` and `custom_entry_amount=50` does not produce a DB error.

---

### F4 — Fix `ServiceTable`: `formatRate` function and add `ServiceApproveButton`

**File:** `src/components/admin/service-table.tsx`

**4a. Replace `formatRate` function:**
```typescript
function formatRate(service: Service): string {
  if (service.rate_label) return service.rate_label
  if (service.rate_type === 'custom' || service.rate_cents == null) return 'Custom'
  const amount = `$${(service.rate_cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
  if (service.rate_type === 'hourly') return `${amount}/hr`
  if (service.rate_type === 'fixed') return `${amount} fixed`
  if (service.rate_type === 'monthly') return `${amount}/mo`
  return amount
}
```

**4b. Add import:**
```typescript
import { ServiceApproveButton } from '@/components/marketplace/ServiceApproveButton'
```

**4c. Add Approve button in actions cell** — in the `<TableCell className="text-right space-x-2">`, add before the Archive button:
```tsx
{!isArchived && service.status === 'pending' && (
  <ServiceApproveButton serviceId={service.id} />
)}
```

**Verification:** Approve button appears on pending rows only. `formatRate` returns correct suffix for fixed/monthly.

---

### F5 — Update Admin Services List Page: status filter and filtered query

**File:** `src/app/(admin)/admin/services/page.tsx`

Replace the entire file with:

```typescript
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ServiceTable } from '@/components/admin/service-table'
import { adminClient } from '@/lib/supabase/admin'

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
    query = (query as typeof query).eq('status', 'pending').is('deleted_at', null)
  } else if (statusFilter === 'active') {
    query = (query as typeof query).eq('status', 'active').is('deleted_at', null)
  }

  const { data: services } = await query

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={buttonVariants()}>
          New Service
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href="/admin/services"
          className={buttonVariants({ variant: !statusFilter ? 'default' : 'outline', size: 'sm' })}
        >
          All
        </Link>
        <Link
          href="/admin/services?status=pending"
          className={buttonVariants({ variant: statusFilter === 'pending' ? 'default' : 'outline', size: 'sm' })}
        >
          Pending Approval
        </Link>
        <Link
          href="/admin/services?status=active"
          className={buttonVariants({ variant: statusFilter === 'active' ? 'default' : 'outline', size: 'sm' })}
        >
          Active
        </Link>
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

**Note on query chaining:** The Supabase query builder returns a new type with each chained call. Use the pattern of re-assigning `query` with cast. Alternatively, build separate queries for each filter case. The Backend agent must choose whichever approach TypeScript accepts without errors. The cleaner pattern:

```typescript
const baseQuery = adminClient
  .from('services')
  .select('id, title, category, rate_type, rate_cents, rate_label, status, is_coming_soon, deleted_at')
  .order('created_at', { ascending: false })

const { data: services } = statusFilter === 'pending'
  ? await baseQuery.eq('status', 'pending').is('deleted_at', null)
  : statusFilter === 'active'
    ? await baseQuery.eq('status', 'active').is('deleted_at', null)
    : await baseQuery
```

Use whichever compiles cleanly.

**Verification:** Navigating to `?status=pending` shows only pending services. `?status=active` shows only active. No param shows all.

---

### F6 — New Service Detail Page: `/marketplace/[slug]`

**File:** `src/app/marketplace/[slug]/page.tsx` (NEW — create directory)

Create the full file per SPEC.md Section 8. Key points:
- `export const revalidate = 60`
- Fetch using `adminClient` (not `createClient`) — public page but needs reliable data access without cookie auth context.
- Status gate: `notFound()` if `status !== 'active' && status !== 'approved'`.
- Provider join: `.select('*, profiles!provider_id(display_name)')`.
- `formatServiceRate` helper function defined in the file.
- Coming Soon overlay: CSS `absolute inset-0` overlay.
- `generateMetadata` exported.
- Entry badge guarded with null check.
- Tags rendered with optional chaining.

See SPEC.md Section 8 for the complete file content.

**Verification:**
- `/marketplace/[slug]` with active service → 200, content visible.
- `/marketplace/[slug]` with pending service → 404.
- Rate display correct for all rate types.
- Coming Soon overlay visible when `is_coming_soon=true`.
- Clicking CTA shows LeadCaptureForm inline.

---

### F7 — Update Marketplace Page: add entry badges and card links

**File:** `src/app/marketplace/page.tsx`

Replace the entire file with the updated version from SPEC.md Section 8 (Modified marketplace page). Key changes:
1. Add `Suspense` and `EntryBadge` imports.
2. Update query select to include `custom_entry_amount` and `slug`.
3. Add `.in('status', ['active', 'approved'])` filter to show only visible services.
4. Wrap each card with `<Link href={/marketplace/${service.slug}}>`.
5. Add `EntryBadge` inside each card with null guard.

**Verification:**
- Service cards link to `/marketplace/[slug]`.
- Cards with `custom_entry_amount > 0` show entry badge.
- Cards with `custom_entry_amount = null` show no entry badge.

---

## Completion Checklist

After all tasks complete:

1. `node node_modules/typescript/bin/tsc --noEmit` — 0 errors
2. `NEXT_PUBLIC_SUPABASE_URL=https://dummy.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy NEXT_PUBLIC_SITE_URL=https://omniincubator.org node node_modules/next/dist/bin/next build` — exits 0
