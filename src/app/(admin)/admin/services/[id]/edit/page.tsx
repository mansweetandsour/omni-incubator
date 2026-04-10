import { notFound } from 'next/navigation'
import { ServiceForm } from '@/components/admin/service-form'
import { adminClient } from '@/lib/supabase/admin'

interface EditServicePageProps {
  params: Promise<{ id: string }>
}

export default async function EditServicePage({ params }: EditServicePageProps) {
  const { id } = await params

  const { data: service } = await adminClient
    .from('services')
    .select('id, slug, title, description, long_description, rate_type, rate_cents, rate_label, category, tags, status, is_coming_soon, custom_entry_amount')
    .eq('id', id)
    .single()

  if (!service) notFound()

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Service</h1>
      <ServiceForm service={service} />
    </div>
  )
}
