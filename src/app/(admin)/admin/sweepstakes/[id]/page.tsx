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
      <h1 className="text-2xl font-bold">Edit Sweepstake</h1>
      <SweepstakeForm sweepstake={sweepstake} />
    </div>
  )
}
