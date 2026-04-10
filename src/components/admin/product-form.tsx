'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FileUploadSection } from './file-upload-section'
import { createProduct, updateProduct, archiveProduct } from '@/app/actions/products'

interface EbookData {
  id: string
  file_path: string
  preview_file_path: string | null
  authors: string[]
  category: string
  subcategory: string | null
  operator_dependency: string | null
  scale_potential: string | null
  cost_to_start: string | null
  tags: string[]
}

interface ProductWithEbook {
  id: string
  slug: string
  title: string
  description: string | null
  long_description: string | null
  price_cents: number
  is_active: boolean
  is_coming_soon: boolean
  custom_entry_amount: number | null
  cover_image_url: string | null
  ebooks: EbookData
}

interface ProductFormProps {
  product?: ProductWithEbook
}

export function ProductForm({ product }: ProductFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isArchiving, setIsArchiving] = useState(false)

  // Tags display state
  const [tagsInput, setTagsInput] = useState(
    product ? product.ebooks.tags.join(', ') : ''
  )

  const isEdit = !!product

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    // Override tags with current tagsInput state
    formData.set('tags', tagsInput)

    startTransition(async () => {
      if (isEdit) {
        const result = await updateProduct(product.id, formData)
        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Saved')
        }
      } else {
        const result = await createProduct(formData)
        if ('error' in result) {
          toast.error(result.error)
        } else {
          router.push(`/admin/products/${result.id}/edit`)
        }
      }
    })
  }

  async function handleArchive() {
    if (!product) return
    setIsArchiving(true)
    const result = await archiveProduct(product.id)
    setIsArchiving(false)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      router.push('/admin/products')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Title */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="title">
          Title <span className="text-red-500">*</span>
        </label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={product?.title ?? ''}
          placeholder="e.g. The SaaS Operator Playbook"
        />
      </div>

      {/* Slug (read-only in edit mode) */}
      {isEdit && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-500">Slug (read-only)</label>
          <Input value={product.slug} readOnly className="opacity-60 cursor-not-allowed" />
        </div>
      )}

      {/* Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">
          Description <span className="text-red-500">*</span>
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={3}
          defaultValue={product?.description ?? ''}
          placeholder="Short product description"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {/* Long Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="long_description">
          Long Description{' '}
          <span className="text-xs text-zinc-400">(Markdown supported)</span>
        </label>
        <textarea
          id="long_description"
          name="long_description"
          rows={8}
          defaultValue={product?.long_description ?? ''}
          placeholder="Full product description in Markdown…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
        />
      </div>

      {/* Price */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="price_cents">
          Price (USD) <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
          <Input
            id="price_cents"
            name="price_cents"
            type="number"
            min="0"
            step="0.01"
            required
            defaultValue={product ? (product.price_cents / 100).toFixed(2) : ''}
            placeholder="29.99"
            className="pl-7"
          />
        </div>
        <p className="text-xs text-zinc-400">Enter price in dollars (e.g. 29.99). Member price is automatically set to 50% off.</p>
      </div>

      {/* Category */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="category">
          Category <span className="text-red-500">*</span>
        </label>
        <select
          id="category"
          name="category"
          required
          defaultValue={product?.ebooks.category ?? ''}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select category…</option>
          <option value="conceptual">Conceptual Learning</option>
          <option value="skill">Skill Learning</option>
          <option value="industry">Industry Guides</option>
          <option value="startup_guide">Startup 0→1 Guides</option>
        </select>
      </div>

      {/* Subcategory */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="subcategory">
          Subcategory
        </label>
        <Input
          id="subcategory"
          name="subcategory"
          defaultValue={product?.ebooks.subcategory ?? ''}
          placeholder="Optional subcategory"
        />
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="tags_input">
          Tags
        </label>
        <Input
          id="tags_input"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="e.g. saas, startup, operations (comma-separated)"
        />
        {tagsInput && (
          <div className="flex flex-wrap gap-1 mt-1">
            {tagsInput
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:text-zinc-200"
                >
                  {tag}
                </span>
              ))}
          </div>
        )}
      </div>

      {/* Operator Dependency */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="operator_dependency">
          Operator Dependency
        </label>
        <select
          id="operator_dependency"
          name="operator_dependency"
          defaultValue={product?.ebooks.operator_dependency ?? ''}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select…</option>
          <option value="physical_service">Physical / Service</option>
          <option value="hybrid">Hybrid</option>
          <option value="digital_saas">Digital / SaaS</option>
        </select>
      </div>

      {/* Scale Potential */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="scale_potential">
          Scale Potential
        </label>
        <select
          id="scale_potential"
          name="scale_potential"
          defaultValue={product?.ebooks.scale_potential ?? ''}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select…</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      {/* Cost to Start */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="cost_to_start">
          Cost to Start
        </label>
        <select
          id="cost_to_start"
          name="cost_to_start"
          defaultValue={product?.ebooks.cost_to_start ?? ''}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Select…</option>
          <option value="under_5k">Under $5K</option>
          <option value="5k_to_50k">$5K – $50K</option>
          <option value="over_50k">Over $50K</option>
        </select>
      </div>

      {/* Custom Entry Amount */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="custom_entry_amount">
          Custom Entry Amount
        </label>
        <Input
          id="custom_entry_amount"
          name="custom_entry_amount"
          type="number"
          min="1"
          defaultValue={product?.custom_entry_amount ?? ''}
          placeholder="Leave blank for default"
        />
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-3">
        <input
          id="is_active"
          name="is_active"
          type="checkbox"
          defaultChecked={product ? product.is_active : true}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <label className="text-sm font-medium" htmlFor="is_active">
          Active (visible to users)
        </label>
      </div>

      {/* Is Coming Soon */}
      <div className="flex items-center gap-3">
        <input
          id="is_coming_soon"
          name="is_coming_soon"
          type="checkbox"
          defaultChecked={product ? product.is_coming_soon : false}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <label className="text-sm font-medium" htmlFor="is_coming_soon">
          Coming Soon
        </label>
      </div>

      {/* File Uploads */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">File Uploads</h3>
        <FileUploadSection
          productId={product?.id}
          type="cover"
          currentValue={product?.cover_image_url ?? null}
          label="Cover Image (JPEG, PNG, or WebP)"
        />
        <FileUploadSection
          productId={product?.id}
          type="main"
          currentValue={product?.ebooks.file_path || null}
          label="Main PDF"
        />
        <FileUploadSection
          productId={product?.id}
          type="preview"
          currentValue={product?.ebooks.preview_file_path ?? null}
          label="Preview PDF"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Product'}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            disabled={isArchiving}
            onClick={handleArchive}
          >
            {isArchiving ? 'Archiving…' : 'Archive Product'}
          </Button>
        )}
      </div>
    </form>
  )
}
