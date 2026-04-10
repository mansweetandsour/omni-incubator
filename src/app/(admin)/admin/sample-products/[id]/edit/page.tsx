import { notFound } from 'next/navigation'
import { adminClient } from '@/lib/supabase/admin'
import { SampleProductForm } from '@/components/admin/sample-product-form'
import { SampleProductFileUpload } from '@/components/admin/sample-product-file-upload'

interface EditSampleProductPageProps {
  params: Promise<{ id: string }>
}

export default async function EditSampleProductPage({ params }: EditSampleProductPageProps) {
  const { id } = await params

  const [productResult, ebooksResult] = await Promise.all([
    adminClient
      .from('sample_products')
      .select('*')
      .eq('id', id)
      .single(),
    adminClient
      .from('products')
      .select('id, title')
      .eq('type', 'ebook')
      .eq('is_active', true)
      .order('title'),
  ])

  if (!productResult.data) notFound()

  const product = productResult.data
  const activeEbooks = (ebooksResult.data ?? []).map((e) => ({ id: e.id, title: e.title }))

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="text-2xl font-bold">Edit Sample Product</h1>

      <SampleProductForm product={product} activeEbooks={activeEbooks} />

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">File Uploads</h2>
        <SampleProductFileUpload
          productId={product.id}
          type="pdf"
          currentValue={product.file_path || null}
          label="PDF File (max 100MB)"
        />
        <SampleProductFileUpload
          productId={product.id}
          type="cover"
          currentValue={product.cover_image_url ?? null}
          label="Cover Image (JPEG, PNG, or WebP — max 20MB)"
        />
      </div>
    </div>
  )
}
