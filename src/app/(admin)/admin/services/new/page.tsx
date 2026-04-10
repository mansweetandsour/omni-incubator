import { ServiceForm } from '@/components/admin/service-form'

export default function NewServicePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">New Service</h1>
      <ServiceForm />
    </div>
  )
}
