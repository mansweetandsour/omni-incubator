import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { buttonVariants } from '@/components/ui/button'
import { SampleProductToggle } from './toggle'

export default async function SampleProductsAdminPage() {
  const { data: products } = await adminClient
    .from('sample_products')
    .select('id, slug, title, is_active, created_at, lead_captures(id, confirmed_at)')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sample Products</h1>
        <Link href="/admin/sample-products/new" className={buttonVariants()}>
          New Sample Product
        </Link>
      </div>

      {!products || products.length === 0 ? (
        <p className="text-zinc-500">No sample products yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Title</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Slug</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Status</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Total Captures</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Confirmed</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Rate</th>
                <th className="text-left py-2 font-medium text-zinc-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const leads = product.lead_captures ?? []
                const total = leads.length
                const confirmed = leads.filter((lc) => lc.confirmed_at !== null).length
                const rate =
                  total === 0 ? '—' : `${Math.round((confirmed / total) * 100)}%`

                return (
                  <tr key={product.id} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-medium">{product.title}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-zinc-500">
                      {product.slug}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          product.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {product.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{total}</td>
                    <td className="py-3 pr-4">{confirmed}</td>
                    <td className="py-3 pr-4">{rate}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/sample-products/${product.id}/edit`}
                          className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                        >
                          Edit
                        </Link>
                        <Link
                          href={`/free/${product.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-zinc-500 hover:underline text-xs"
                        >
                          View ↗
                        </Link>
                        <SampleProductToggle
                          id={product.id}
                          isActive={product.is_active}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
