import { notFound } from 'next/navigation'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { MultiplierManager } from '@/components/admin/multiplier-manager'

interface MultipliersPageProps {
  params: Promise<{ id: string }>
}

export default async function MultipliersPage({ params }: MultipliersPageProps) {
  const { id } = await params

  const { data: sweepstake } = await adminClient
    .from('sweepstakes')
    .select('id, title, status')
    .eq('id', id)
    .single()

  if (!sweepstake) notFound()

  const { data: multipliers } = await adminClient
    .from('entry_multipliers')
    .select('*')
    .eq('sweepstake_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/sweepstakes" className="text-sm text-zinc-500 hover:underline">
            ← Back to Sweepstakes
          </Link>
          <h1 className="text-2xl font-bold mt-1">
            Multipliers — {sweepstake.title}
          </h1>
        </div>
      </div>

      <MultiplierManager
        sweepstakeId={id}
        multipliers={multipliers ?? []}
      />
    </div>
  )
}
