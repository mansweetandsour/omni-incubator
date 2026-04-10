'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { upsertMultiplier, toggleMultiplier } from '@/app/(admin)/admin/sweepstakes/actions'

interface MultiplierRow {
  id: string
  name: string
  description: string | null
  multiplier: number
  start_at: string
  end_at: string
  is_active: boolean
}

interface MultiplierManagerProps {
  sweepstakeId: string
  multipliers: MultiplierRow[]
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

export function MultiplierManager({ sweepstakeId, multipliers }: MultiplierManagerProps) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const editingMultiplier = multipliers.find((m) => m.id === editingId) ?? null

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    if (editingId) {
      formData.set('id', editingId)
    }
    const result = await upsertMultiplier(sweepstakeId, formData)
    setLoading(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      if (result.warning) {
        toast.warning(result.warning)
      } else {
        toast.success('Multiplier saved')
      }
      setShowForm(false)
      setEditingId(null)
      router.refresh()
    }
  }

  async function handleToggle(id: string, current: boolean) {
    const result = await toggleMultiplier(id, !current)
    if (result.error) {
      toast.error(result.error)
    } else {
      router.refresh()
    }
  }

  return (
    <div className="space-y-6">
      {/* Add / Edit Form */}
      {(showForm || editingId) ? (
        <div className="border rounded-lg p-4 space-y-4">
          <h2 className="font-semibold">{editingId ? 'Edit Multiplier' : 'New Multiplier'}</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-sm font-medium">Name *</label>
              <input
                name="name"
                defaultValue={editingMultiplier?.name ?? ''}
                required
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium">Description</label>
              <input
                name="description"
                defaultValue={editingMultiplier?.description ?? ''}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="block text-sm font-medium">Multiplier *</label>
                <input
                  name="multiplier"
                  type="number"
                  step="0.01"
                  min="0.01"
                  defaultValue={editingMultiplier?.multiplier ?? ''}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">Start At *</label>
                <input
                  name="start_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(editingMultiplier?.start_at ?? null)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-sm font-medium">End At *</label>
                <input
                  name="end_at"
                  type="datetime-local"
                  defaultValue={toDatetimeLocal(editingMultiplier?.end_at ?? null)}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700 disabled:opacity-50"
              >
                {loading ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null) }}
                className="px-4 py-2 rounded border text-sm hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 rounded bg-zinc-900 text-white text-sm hover:bg-zinc-700"
        >
          + Add Multiplier
        </button>
      )}

      {/* Multipliers Table */}
      {multipliers.length === 0 ? (
        <p className="text-zinc-500 text-sm">No multipliers yet.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Name</th>
              <th className="text-left py-2 pr-4">Multiplier</th>
              <th className="text-left py-2 pr-4">Start</th>
              <th className="text-left py-2 pr-4">End</th>
              <th className="text-left py-2 pr-4">Active</th>
              <th className="text-left py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {multipliers.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="py-2 pr-4 font-medium">{m.name}</td>
                <td className="py-2 pr-4">{m.multiplier}x</td>
                <td className="py-2 pr-4">{new Date(m.start_at).toLocaleDateString()}</td>
                <td className="py-2 pr-4">{new Date(m.end_at).toLocaleDateString()}</td>
                <td className="py-2 pr-4">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      m.is_active ? 'bg-green-100 text-green-700' : 'bg-zinc-100 text-zinc-500'
                    }`}
                  >
                    {m.is_active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setEditingId(m.id); setShowForm(false) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggle(m.id, m.is_active)}
                      className="text-xs text-zinc-600 hover:underline"
                    >
                      {m.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
