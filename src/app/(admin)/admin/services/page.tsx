import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ServiceTable } from '@/components/admin/service-table'
import { adminClient } from '@/lib/supabase/admin'

export default async function AdminServicesPage() {
  const { data: services } = await adminClient
    .from('services')
    .select('id, title, category, rate_type, rate_cents, rate_label, status, is_coming_soon, deleted_at')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Services</h1>
        <Link href="/admin/services/new" className={buttonVariants()}>
          New Service
        </Link>
      </div>
      {services && services.length > 0 ? (
        <ServiceTable services={services} />
      ) : (
        <p className="text-zinc-500">No services yet. Create your first one.</p>
      )}
    </div>
  )
}
