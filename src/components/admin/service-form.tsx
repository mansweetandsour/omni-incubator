'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createService, updateService, archiveService } from '@/app/actions/services'

interface Service {
  id: string
  slug: string
  title: string
  description: string | null
  long_description: string | null
  rate_type: string
  rate_cents: number | null
  rate_label: string | null
  category: string
  tags: string[]
  status: string | null
  is_coming_soon: boolean
  custom_entry_amount: number | null
}

interface ServiceFormProps {
  service?: Service
}

export function ServiceForm({ service }: ServiceFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isArchiving, setIsArchiving] = useState(false)
  const [rateType, setRateType] = useState(service?.rate_type ?? 'hourly')
  const [tagsInput, setTagsInput] = useState(service ? service.tags.join(', ') : '')

  const isEdit = !!service

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const formData = new FormData(form)
    formData.set('tags', tagsInput)
    formData.set('rate_type', rateType)

    startTransition(async () => {
      if (isEdit) {
        const result = await updateService(service.id, formData)
        if ('error' in result) {
          toast.error(result.error)
        } else {
          toast.success('Saved')
        }
      } else {
        const result = await createService(formData)
        if ('error' in result) {
          toast.error(result.error)
        } else {
          router.push(`/admin/services/${result.id}/edit`)
        }
      }
    })
  }

  async function handleArchive() {
    if (!service) return
    setIsArchiving(true)
    const result = await archiveService(service.id)
    setIsArchiving(false)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      router.push('/admin/services')
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
          defaultValue={service?.title ?? ''}
          placeholder="e.g. SaaS Growth Consulting"
        />
      </div>

      {/* Slug (read-only in edit mode) */}
      {isEdit && (
        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-500">Slug (read-only)</label>
          <Input value={service.slug} readOnly className="opacity-60 cursor-not-allowed" />
        </div>
      )}

      {/* Description */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={service?.description ?? ''}
          placeholder="Short description"
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
          rows={6}
          defaultValue={service?.long_description ?? ''}
          placeholder="Full description in Markdown…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y font-mono"
        />
      </div>

      {/* Rate Type */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="rate_type">
          Rate Type <span className="text-red-500">*</span>
        </label>
        <select
          id="rate_type"
          name="rate_type"
          required
          value={rateType}
          onChange={(e) => setRateType(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="hourly">Hourly</option>
          <option value="fixed">Fixed</option>
          <option value="monthly">Monthly</option>
          <option value="custom">Custom</option>
        </select>
      </div>

      {/* Rate Amount (hidden when custom) */}
      {rateType !== 'custom' && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="rate_cents">
            Rate Amount (USD) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">$</span>
            <Input
              id="rate_cents"
              name="rate_cents"
              type="number"
              min="1"
              step="0.01"
              defaultValue={service?.rate_cents ? (service.rate_cents / 100).toFixed(2) : ''}
              placeholder="150.00"
              className="pl-7"
            />
          </div>
        </div>
      )}

      {/* Rate Label */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="rate_label">
          Rate Label
        </label>
        <Input
          id="rate_label"
          name="rate_label"
          defaultValue={service?.rate_label ?? ''}
          placeholder="e.g. Starting at $150/hr"
        />
      </div>

      {/* Category */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="category">
          Category <span className="text-red-500">*</span>
        </label>
        <Input
          id="category"
          name="category"
          required
          defaultValue={service?.category ?? ''}
          placeholder="e.g. Consulting, Development"
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
          placeholder="e.g. growth, saas, consulting (comma-separated)"
        />
      </div>

      {/* Custom Entry Amount */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="custom_entry_amount">
          Entry Amount <span className="text-xs text-zinc-400">(optional — overrides default entry calculation)</span>
        </label>
        <Input
          id="custom_entry_amount"
          name="custom_entry_amount"
          type="number"
          min="1"
          defaultValue={service?.custom_entry_amount ?? ''}
          placeholder="e.g. 50"
        />
      </div>

      {/* Status (edit mode only) */}
      {isEdit && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <label className="text-sm font-medium" htmlFor="status">
              Status
            </label>
            <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              service.status === 'approved' ? 'bg-blue-100 text-blue-800 border-blue-200' :
              service.status === 'active' ? 'bg-green-100 text-green-800 border-green-200' :
              service.status === 'suspended' ? 'bg-red-100 text-red-800 border-red-200' :
              'bg-amber-100 text-amber-800 border-amber-200'
            }`}>
              {service.status ?? 'pending'}
            </span>
          </div>
          <select
            id="status"
            name="status"
            defaultValue={service.status ?? 'pending'}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      )}

      {/* Is Coming Soon */}
      <div className="flex items-center gap-3">
        <input
          id="is_coming_soon"
          name="is_coming_soon"
          type="checkbox"
          defaultChecked={service ? service.is_coming_soon : true}
          className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
        />
        <label className="text-sm font-medium" htmlFor="is_coming_soon">
          Coming Soon
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Service'}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="destructive"
            disabled={isArchiving}
            onClick={handleArchive}
          >
            {isArchiving ? 'Archiving…' : 'Archive Service'}
          </Button>
        )}
      </div>
    </form>
  )
}
