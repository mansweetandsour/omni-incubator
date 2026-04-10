import { notFound } from 'next/navigation'
import { ProductForm } from '@/components/admin/product-form'
import { adminClient } from '@/lib/supabase/admin'

interface EditProductPageProps {
  params: Promise<{ id: string }>
}

export default async function EditProductPage({ params }: EditProductPageProps) {
  const { id } = await params

  const { data: product } = await adminClient
    .from('products')
    .select('id, slug, title, description, long_description, price_cents, is_active, is_coming_soon, custom_entry_amount, cover_image_url, ebooks!inner(id, file_path, preview_file_path, authors, category, subcategory, operator_dependency, scale_potential, cost_to_start, tags)')
    .eq('id', id)
    .single()

  if (!product) notFound()

  // Normalize ebooks: may be array or single object depending on Supabase return
  const ebooksRaw = product.ebooks
  const ebook = Array.isArray(ebooksRaw) ? ebooksRaw[0] : ebooksRaw

  if (!ebook) notFound()

  const productWithEbook = {
    ...product,
    ebooks: ebook,
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Edit Product</h1>
      <ProductForm product={productWithEbook} />
    </div>
  )
}
