import { CouponForm } from '@/components/admin/coupon-form'

export default function NewCouponPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Coupon</h1>
      <CouponForm />
    </div>
  )
}
