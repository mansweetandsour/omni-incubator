import { adminClient } from '@/lib/supabase/admin'
import { SampleProductForm } from '@/components/admin/sample-product-form'

export default async function NewSampleProductPage() {
  const { data: ebooks } = await adminClient
    .from('products')
    .select('id, title')
    .eq('type', 'ebook')
    .eq('is_active', true)
    .order('title')

  const activeEbooks = (ebooks ?? []).map((e) => ({ id: e.id, title: e.title }))

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">New Sample Product</h1>
      <SampleProductForm activeEbooks={activeEbooks} />
    </div>
  )
}
