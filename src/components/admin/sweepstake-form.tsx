'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { createSweepstake, updateSweepstake } from '@/app/(admin)/admin/sweepstakes/actions'

interface SweepstakeRow {
  id: string
  title: string
  description: string | null
  prize_amount_cents: number | null
  prize_description: string | null
  start_at: string | null
  end_at: string | null
  non_purchase_entry_amount: number
  official_rules_url: string | null
}

interface SweepstakeFormProps {
  sweepstake?: SweepstakeRow
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16) // 'YYYY-MM-DDTHH:MM'
}

export function SweepstakeForm({ sweepstake }: SweepstakeFormProps) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    let result: { error?: string }

    if (sweepstake) {
      result = await updateSweepstake(sweepstake.id, formData)
    } else {
      result = await createSweepstake(formData)
    }

    setLoading(false)
    if (result?.error) {
      setError(result.error)
    } else {
      router.push('/admin/sweepstakes')
    }
  }

  const prizeAmountDollars = sweepstake?.prize_amount_cents
    ? (sweepstake.prize_amount_cents / 100).toString()
    : ''

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium">Title *</label>
        <input
          name="title"
          defaultValue={sweepstake?.title ?? ''}
          required
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Description</label>
        <textarea
          name="description"
          defaultValue={sweepstake?.description ?? ''}
          rows={3}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Prize Amount ($)</label>
          <input
            name="prize_amount_dollars"
            type="number"
            min="0"
            step="0.01"
            defaultValue={prizeAmountDollars}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Non-Purchase Entry Amount</label>
          <input
            name="non_purchase_entry_amount"
            type="number"
            min="1"
            step="1"
            defaultValue={sweepstake?.non_purchase_entry_amount ?? 1}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Prize Description</label>
        <input
          name="prize_description"
          defaultValue={sweepstake?.prize_description ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Start At</label>
          <input
            name="start_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(sweepstake?.start_at ?? null)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">End At</label>
          <input
            name="end_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(sweepstake?.end_at ?? null)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Official Rules URL</label>
        <input
          name="official_rules_url"
          type="url"
          defaultValue={sweepstake?.official_rules_url ?? ''}
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? 'Saving…' : sweepstake ? 'Save Changes' : 'Create Sweepstake'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2 rounded border text-sm hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
