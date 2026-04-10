import { notFound } from 'next/navigation'
import { adminClient } from '@/lib/supabase/admin'
import { CouponForm } from '@/components/admin/coupon-form'

interface EditCouponPageProps {
  params: Promise<{ id: string }>
}

export default async function EditCouponPage({ params }: EditCouponPageProps) {
  const { id } = await params

  const { data: coupon } = await adminClient
    .from('coupons')
    .select('*')
    .eq('id', id)
    .single()

  if (!coupon) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Edit Coupon</h1>
      <CouponForm coupon={coupon} />
    </div>
  )
}
