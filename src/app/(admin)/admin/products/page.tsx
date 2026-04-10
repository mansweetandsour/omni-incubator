import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { ProductTable } from '@/components/admin/product-table'
import { adminClient } from '@/lib/supabase/admin'

export default async function AdminProductsPage() {
  const [{ data: products }, { data: activeSweepstake }] = await Promise.all([
    adminClient
      .from('products')
      .select('id, slug, title, price_cents, is_active, deleted_at, created_at, ebooks!inner(id, category)')
      .eq('type', 'ebook')
      .order('created_at', { ascending: false }),
    adminClient.from('sweepstakes').select('id').eq('status', 'active').maybeSingle(),
  ])

  return (
    <div className="space-y-6">
      {!activeSweepstake && (
        <div className="rounded-md bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 mb-4 text-sm font-medium">
          ⚠️ No active sweepstake — purchases are not earning entries
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link href="/admin/products/new" className={buttonVariants()}>
          New Product
        </Link>
      </div>
      {products && products.length > 0 ? (
        <ProductTable products={products} />
      ) : (
        <p className="text-zinc-500">No products yet. Create your first one.</p>
      )}
    </div>
  )
}
