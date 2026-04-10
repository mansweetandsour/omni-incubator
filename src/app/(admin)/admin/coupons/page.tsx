import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { buttonVariants } from '@/components/ui/button'
import { CouponToggle } from '@/components/admin/coupon-toggle'

export default async function CouponsAdminPage() {
  const { data: coupons } = await adminClient
    .from('coupons')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Coupons</h1>
        <Link href="/admin/coupons/new" className={buttonVariants()}>
          New Coupon
        </Link>
      </div>

      {!coupons || coupons.length === 0 ? (
        <p className="text-zinc-500">No coupons yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Code</th>
                <th className="text-left py-2 pr-4">Name</th>
                <th className="text-left py-2 pr-4">Type</th>
                <th className="text-left py-2 pr-4">Value</th>
                <th className="text-left py-2 pr-4">Uses</th>
                <th className="text-left py-2 pr-4">Expires</th>
                <th className="text-left py-2 pr-4">Active</th>
                <th className="text-left py-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-mono font-medium">{c.code}</td>
                  <td className="py-3 pr-4">{c.name ?? '—'}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        c.entry_type === 'multiplier'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-orange-100 text-orange-700'
                      }`}
                    >
                      {c.entry_type}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {c.entry_type === 'multiplier'
                      ? `${c.entry_value}x`
                      : `+${c.entry_value} entries`}
                  </td>
                  <td className="py-3 pr-4">
                    {c.current_uses}
                    {c.max_uses_global ? ` / ${c.max_uses_global}` : ''}
                  </td>
                  <td className="py-3 pr-4">
                    {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <CouponToggle id={c.id} isActive={c.is_active} />
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/admin/coupons/${c.id}`}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
