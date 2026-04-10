import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  refunded: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

export default async function AdminDashboardPage() {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    membersResult,
    revenueResult,
    activeSweepstakeResult,
    recentOrdersResult,
    totalLeadsResult,
    confirmedLeadsResult,
  ] = await Promise.all([
    adminClient
      .from('subscriptions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['trialing', 'active']),
    adminClient
      .from('orders')
      .select('total_cents')
      .eq('status', 'completed')
      .gte('created_at', monthStart),
    adminClient
      .from('sweepstakes')
      .select('id, title, end_at, prize_amount_cents')
      .eq('status', 'active')
      .maybeSingle(),
    adminClient
      .from('orders')
      .select('id, order_number, total_cents, status, created_at, profiles!inner(email)')
      .order('created_at', { ascending: false })
      .limit(10),
    adminClient
      .from('lead_captures')
      .select('id', { count: 'exact', head: true }),
    adminClient
      .from('lead_captures')
      .select('id', { count: 'exact', head: true })
      .not('confirmed_at', 'is', null),
  ])

  const activeMembers = membersResult.count ?? 0

  const monthlyRevenueCents = (revenueResult.data ?? []).reduce(
    (sum, o) => sum + (o.total_cents ?? 0),
    0
  )

  const activeSweepstake = activeSweepstakeResult.data

  let sweepstakeTotalEntries = 0
  if (activeSweepstake) {
    const { data: entries } = await adminClient
      .from('sweepstake_entries')
      .select('total_entries')
      .eq('sweepstake_id', activeSweepstake.id)
    sweepstakeTotalEntries = (entries ?? []).reduce(
      (sum, e) => sum + (e.total_entries ?? 0),
      0
    )
  }

  const daysRemaining = activeSweepstake
    ? Math.ceil(
        (new Date(activeSweepstake.end_at).getTime() - Date.now()) / 86400000
      )
    : null

  const totalLeads = totalLeadsResult.count ?? 0
  const confirmedLeads = confirmedLeadsResult.count ?? 0

  type OrderRow = {
    id: string
    order_number: string
    total_cents: number
    status: string
    created_at: string
    profiles: { email: string } | { email: string }[]
  }

  const recentOrders = (recentOrdersResult.data ?? []) as OrderRow[]

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* No active sweepstake warning */}
      {!activeSweepstake && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          ⚠️ No active sweepstake — purchases are not earning entries.
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Active Members
          </p>
          <p className="text-3xl font-bold">{activeMembers.toLocaleString()}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Revenue This Month
          </p>
          <p className="text-3xl font-bold">{formatCents(monthlyRevenueCents)}</p>
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Active Sweepstake
          </p>
          {activeSweepstake ? (
            <>
              <p className="text-base font-semibold truncate" title={activeSweepstake.title}>
                {activeSweepstake.title}
              </p>
              <p className="text-sm text-zinc-500">
                {sweepstakeTotalEntries.toLocaleString()} entries ·{' '}
                {daysRemaining !== null && daysRemaining > 0
                  ? `${daysRemaining}d left`
                  : 'Ending soon'}
              </p>
              <Link
                href={`/admin/sweepstakes/${activeSweepstake.id}`}
                className="text-xs text-blue-600 dark:text-blue-400 underline"
              >
                View sweepstake →
              </Link>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No active sweepstake</p>
          )}
        </div>

        <div className="rounded-lg border bg-card p-5 space-y-1">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            Lead Captures
          </p>
          <p className="text-3xl font-bold">{totalLeads.toLocaleString()}</p>
          <p className="text-sm text-zinc-500">
            {confirmedLeads.toLocaleString()} confirmed (
            {totalLeads > 0 ? Math.round((confirmedLeads / totalLeads) * 100) : 0}%)
          </p>
        </div>
      </div>

      {/* Recent Orders */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent Orders</h2>
          <Link
            href="/admin/orders"
            className="text-sm text-blue-600 dark:text-blue-400 underline"
          >
            View all →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <p className="text-sm text-zinc-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium text-zinc-500">Order #</th>
                  <th className="text-left py-2 pr-4 font-medium text-zinc-500">Customer</th>
                  <th className="text-left py-2 pr-4 font-medium text-zinc-500">Amount</th>
                  <th className="text-left py-2 pr-4 font-medium text-zinc-500">Status</th>
                  <th className="text-left py-2 font-medium text-zinc-500">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => {
                  const profile = Array.isArray(order.profiles)
                    ? order.profiles[0]
                    : order.profiles
                  return (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-3 pr-4 font-mono text-xs">{order.order_number}</td>
                      <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400 truncate max-w-[200px]">
                        {profile?.email ?? '—'}
                      </td>
                      <td className="py-3 pr-4 font-medium">
                        {formatCents(order.total_cents)}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[order.status] ?? 'bg-zinc-100 text-zinc-600'}`}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="py-3 text-zinc-500">{formatDate(order.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
