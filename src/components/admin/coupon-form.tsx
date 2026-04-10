'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createCoupon, updateCoupon } from '@/app/(admin)/admin/sweepstakes/actions'

interface CouponRow {
  id: string
  code: string
  name: string | null
  entry_type: string
  entry_value: number
  max_uses_global: number | null
  max_uses_per_user: number
  expires_at: string | null
  sweepstake_id: string | null
  is_active: boolean
}

interface CouponFormProps {
  coupon?: CouponRow
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function CouponForm({ coupon }: CouponFormProps) {
  const router = useRouter()
  const [code, setCode] = useState(coupon?.code ?? '')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const isEdit = !!coupon

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    let result: { error?: string }

    if (isEdit) {
      result = await updateCoupon(coupon.id, formData)
    } else {
      result = await createCoupon(formData)
    }

    setLoading(false)
    if (result?.error) {
      setError(result.error)
    } else {
      router.push('/admin/coupons')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium">Code *</label>
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onBlur={() => setCode(code.toUpperCase())}
          required
          disabled={isEdit}
          readOnly={isEdit}
          placeholder="SAVE10"
          className="w-full border rounded-md px-3 py-2 text-sm font-mono disabled:bg-zinc-50 disabled:text-zinc-500"
        />
        {isEdit && (
          <p className="text-xs text-zinc-400">Code cannot be changed after creation.</p>
        )}
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">Name</label>
        <input
          name="name"
          defaultValue={coupon?.name ?? ''}
          placeholder="Summer promotion"
          className="w-full border rounded-md px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Entry Type *</label>
          <select
            name="entry_type"
            defaultValue={coupon?.entry_type ?? 'multiplier'}
            required
            className="w-full border rounded-md px-3 py-2 text-sm"
          >
            <option value="multiplier">Multiplier</option>
            <option value="fixed_bonus">Fixed Bonus</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Entry Value *</label>
          <input
            name="entry_value"
            type="number"
            step="0.01"
            min="0"
            defaultValue={coupon?.entry_value ?? ''}
            required
            placeholder="1.5 or 25"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Max Uses (Global)</label>
          <input
            name="max_uses_global"
            type="number"
            min="1"
            step="1"
            defaultValue={coupon?.max_uses_global ?? ''}
            placeholder="Unlimited"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Max Uses Per User</label>
          <input
            name="max_uses_per_user"
            type="number"
            min="1"
            step="1"
            defaultValue={coupon?.max_uses_per_user ?? 1}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Expires At</label>
          <input
            name="expires_at"
            type="datetime-local"
            defaultValue={toDatetimeLocal(coupon?.expires_at ?? null)}
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Sweepstake ID</label>
          <input
            name="sweepstake_id"
            defaultValue={coupon?.sweepstake_id ?? ''}
            placeholder="Optional UUID"
            className="w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 disabled:opacity-50"
        >
          {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Coupon'}
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
