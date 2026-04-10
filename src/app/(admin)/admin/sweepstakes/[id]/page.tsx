import { notFound } from 'next/navigation'
import { adminClient } from '@/lib/supabase/admin'
import { SweepstakeForm } from '@/components/admin/sweepstake-form'

interface EditSweepstakePageProps {
  params: Promise<{ id: string }>
}

export default async function EditSweepstakePage({ params }: EditSweepstakePageProps) {
  const { id } = await params

  const { data: sweepstake } = await adminClient
    .from('sweepstakes')
    .select('*')
    .eq('id', id)
    .single()

  if (!sweepstake) notFound()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Sweepstake</h1>
        <a
          href={`/api/admin/sweepstakes/${id}/export`}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-300 dark:border-zinc-600 bg-background px-3 text-sm font-medium hover:bg-muted transition-colors"
        >
          Export CSV
        </a>
      </div>
      <SweepstakeForm sweepstake={sweepstake} />
    </div>
  )
}
