import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ServiceTable } from '@/components/admin/service-table'
import { adminClient } from '@/lib/supabase/admin'

interface AdminServicesPageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function AdminServicesPage({ searchParams }: AdminServicesPageProps) {
  const { status: statusFilter } = await searchParams

  const baseQuery = adminClient
    .from('services')
    .select('id, title, category, rate_type, rate_cents, rate_label, status, is_coming_soon, deleted_at')
    .order('created_at', { ascending: false })

  const { data: services } = statusFilter === 'pending'
    ? await baseQuery.eq('status', 'pending').is('deleted_at', null)
    : statusFilter === 'active'
      ? await baseQuery.eq('status', 'active').is('deleted_at', null)
      : await baseQuery

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
