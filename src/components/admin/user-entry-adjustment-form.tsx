'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { adjustUserEntries } from '@/app/actions/admin-users'

interface SweepstakeOption {
  id: string
  title: string
  status: string
}

interface UserEntryAdjustmentFormProps {
  userId: string
  sweepstakes: SweepstakeOption[]
  activeSweepstakeId: string | null
}

export function UserEntryAdjustmentForm({
  userId,
  sweepstakes,
  activeSweepstakeId,
}: UserEntryAdjustmentFormProps) {
  const [isPending, startTransition] = useTransition()
  const [sweepstakeId, setSweepstakeId] = useState(activeSweepstakeId ?? '')
  const [entries, setEntries] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const entriesNum = parseInt(entries, 10)
    if (isNaN(entriesNum) || entriesNum === 0) {
      setError('Entries must be a non-zero integer')
      return
    }
    if (!notes.trim()) {
      setError('Notes are required')
      return
    }
    if (!sweepstakeId) {
      setError('Please select a sweepstake')
      return
    }

    startTransition(async () => {
      const result = await adjustUserEntries(userId, sweepstakeId, entriesNum, notes)
      if (result.error) {
        setError(result.error)
      } else {
        toast.success('Entry adjustment saved')
        setEntries('')
        setNotes('')
        setSweepstakeId(activeSweepstakeId ?? '')
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="adj-sweepstake">
          Sweepstake <span className="text-red-500">*</span>
        </label>
        <select
          id="adj-sweepstake"
          value={sweepstakeId}
          onChange={(e) => setSweepstakeId(e.target.value)}
          required
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <option value="">— Select sweepstake —</option>
          {sweepstakes.map((sw) => (
            <option key={sw.id} value={sw.id}>
              {sw.title}{' '}
              {sw.status === 'active' ? '(active)' : `(${sw.status})`}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="adj-entries">
          Entries <span className="text-red-500">*</span>
        </label>
        <Input
          id="adj-entries"
          type="number"
          value={entries}
          onChange={(e) => setEntries(e.target.value)}
          required
          placeholder="e.g. 5 or -5"
        />
        <p className="text-xs text-zinc-400">
          Use a positive number to add entries, negative to remove.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="adj-notes">
          Notes <span className="text-red-500">*</span>
        </label>
        <textarea
          id="adj-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required
          rows={3}
          placeholder="Reason for this adjustment…"
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <Button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Apply Adjustment'}
      </Button>
    </form>
  )
}
