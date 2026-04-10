'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createSampleProduct,
  updateSampleProduct,
} from '@/app/actions/sample-products'

interface SampleProductRow {
  id: string
  title: string
  slug: string
  description: string | null
  long_description: string | null
  require_phone: boolean
  upsell_product_id: string | null
  upsell_membership: boolean
  upsell_heading: string | null
  upsell_body: string | null
  custom_entry_amount: number | null
  is_active: boolean
}

interface SampleProductFormProps {
  product?: SampleProductRow
  activeEbooks: Array<{ id: string; title: string }>
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function SampleProductForm({ product, activeEbooks }: SampleProductFormProps) {
  const isEdit = !!product
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState(product?.title ?? '')
  const [slug, setSlug] = useState(product?.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(isEdit)

  function handleTitleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    setTitle(value)
    if (!slugTouched) {
      setSlug(generateSlug(value))
    }
  }

  function handleSlugChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSlugTouched(true)
    setSlug(e.target.value)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      let result: { error?: string }
      if (isEdit) {
        result = await updateSampleProduct(product.id, formData)
      } else {
        result = await createSampleProduct(formData)
      }
      if (result?.error) {
        setError(result.error)
        toast.error(result.error)
      }
      // createSampleProduct calls redirect() on success — no further handling needed
    })
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
          value={title}
          onChange={handleTitleChange}
          placeholder="e.g. The Founder's Cheat Sheet"
        />
      </div>

      {/* Slug */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="slug">
          Slug <span className="text-red-500">*</span>
        </label>
        <Input
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={handleSlugChange}
          placeholder="e.g. founders-cheat-sheet"
        />
        <p className="text-xs text-zinc-400">
          Lowercase letters, numbers, and hyphens only. Used in URL: /free/
          <span className="font-mono">{slug || 'slug'}</span>
        </p>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">
          Short Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={product?.description ?? ''}
          placeholder="Brief description shown in meta/hero"
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
          placeholder="Full content shown below the capture form…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
        />
      </div>

      {/* Require Email — always on */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="require_email"
          checked
          disabled
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500 opacity-60 cursor-not-allowed"
        />
        <label className="text-sm font-medium text-zinc-500" htmlFor="require_email">
          Require Email (always enabled)
        </label>
      </div>

      {/* Require Phone */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="require_phone"
          name="require_phone"
          defaultChecked={product?.require_phone ?? false}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <label className="text-sm font-medium" htmlFor="require_phone">
          Require Phone Number
        </label>
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
          placeholder="Leave blank to use sweepstake default"
        />
        <p className="text-xs text-zinc-400">
          If set, overrides the sweepstake&apos;s default non-purchase entry amount.
        </p>
      </div>

      {/* Upsell Section */}
      <div className="space-y-4 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
          Upsell Options
        </h3>

        {/* Upsell Product */}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="upsell_product_id">
            Upsell E-book
          </label>
          <select
            id="upsell_product_id"
            name="upsell_product_id"
            defaultValue={product?.upsell_product_id ?? ''}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <option value="">— None —</option>
            {activeEbooks.map((eb) => (
              <option key={eb.id} value={eb.id}>
                {eb.title}
              </option>
            ))}
          </select>
        </div>

        {/* Upsell Membership */}
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="upsell_membership"
            name="upsell_membership"
            defaultChecked={product?.upsell_membership ?? true}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          <label className="text-sm font-medium" htmlFor="upsell_membership">
            Show Membership Upsell
          </label>
        </div>

        {/* Upsell Heading */}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="upsell_heading">
            Upsell Heading
          </label>
          <Input
            id="upsell_heading"
            name="upsell_heading"
            defaultValue={product?.upsell_heading ?? ''}
            placeholder="e.g. Want more resources like this?"
          />
        </div>

        {/* Upsell Body */}
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="upsell_body">
            Upsell Body Text
          </label>
          <textarea
            id="upsell_body"
            name="upsell_body"
            rows={3}
            defaultValue={product?.upsell_body ?? ''}
            placeholder="Short upsell message"
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          />
        </div>
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="is_active"
          name="is_active"
          defaultChecked={product?.is_active ?? true}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <label className="text-sm font-medium" htmlFor="is_active">
          Active (landing page publicly accessible)
        </label>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Sample Product'}
        </Button>
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
      </div>
    </form>
  )
}
