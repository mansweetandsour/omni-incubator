import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { buttonVariants } from '@/components/ui/button'
import { SweepstakeActions } from '@/components/admin/sweepstake-actions'

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700',
  active: 'bg-green-100 text-green-700',
  ended: 'bg-amber-100 text-amber-700',
  drawn: 'bg-purple-100 text-purple-700',
}

export default async function SweepstakesAdminPage() {
  const { data: sweepstakes } = await adminClient
    .from('sweepstakes')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sweepstakes</h1>
        <Link href="/admin/sweepstakes/new" className={buttonVariants()}>
          New Sweepstake
        </Link>
      </div>

      {!sweepstakes || sweepstakes.length === 0 ? (
        <p className="text-zinc-500">No sweepstakes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4">Title</th>
                <th className="text-left py-2 pr-4">Status</th>
                <th className="text-left py-2 pr-4">Prize</th>
                <th className="text-left py-2 pr-4">Start</th>
                <th className="text-left py-2 pr-4">End</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sweepstakes.map((sw) => (
                <tr key={sw.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{sw.title}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[sw.status] ?? 'bg-zinc-100 text-zinc-700'}`}
                    >
                      {sw.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {sw.prize_amount_cents
                      ? `$${(sw.prize_amount_cents / 100).toLocaleString('en-US')}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {sw.start_at ? new Date(sw.start_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    {sw.end_at ? new Date(sw.end_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/sweepstakes/${sw.id}`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </Link>
                      <Link
                        href={`/admin/sweepstakes/${sw.id}/multipliers`}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Multipliers
                      </Link>
                      <SweepstakeActions id={sw.id} status={sw.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
