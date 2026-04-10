import { notFound } from 'next/navigation'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'
import { UserEntryAdjustmentForm } from '@/components/admin/user-entry-adjustment-form'

interface UserDetailPageProps {
  params: Promise<{ id: string }>
}

const SOURCE_LABELS: Record<string, string> = {
  purchase: 'E-book Purchase',
  non_purchase_capture: 'Free Entry',
  admin_adjustment: 'Admin Adjustment',
  coupon_bonus: 'Coupon Bonus',
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
    cents / 100
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default async function AdminUserDetailPage({ params }: UserDetailPageProps) {
  const { id } = await params

  const [
    profileResult,
    subscriptionResult,
    ordersResult,
    userEbooksResult,
    entryVerificationResult,
    entryHistoryResult,
    sweepstakesResult,
  ] = await Promise.all([
    adminClient.from('profiles').select('*').eq('id', id).single(),
    adminClient.from('subscriptions').select('*').eq('user_id', id).maybeSingle(),
    adminClient
      .from('orders')
      .select('id, order_number, total_cents, status, created_at, order_items(id)')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
    adminClient
      .from('user_ebooks')
      .select('acquired_at, download_count, products!inner(title)')
      .eq('user_id', id),
    adminClient
      .from('entry_verification')
      .select(
        'sweepstake_id, total_entries, purchase_entries, non_purchase_entries, admin_entries, coupon_bonus_entries'
      )
      .eq('user_id', id),
    adminClient
      .from('sweepstake_entries')
      .select('created_at, source, total_entries, notes')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(50),
    adminClient
      .from('sweepstakes')
      .select('id, title, status')
      .order('created_at', { ascending: false }),
  ])

  if (!profileResult.data) notFound()

  const profile = profileResult.data
  const subscription = subscriptionResult.data
  const orders = ordersResult.data ?? []
  const userEbooks = userEbooksResult.data ?? []
  const entryVerifications = entryVerificationResult.data ?? []
  const entryHistory = entryHistoryResult.data ?? []
  const sweepstakes = sweepstakesResult.data ?? []

  // Fetch sweepstake titles for entry verification rows
  const sweepstakeIds = entryVerifications.map((ev) => ev.sweepstake_id).filter(Boolean)
  let sweepstakeTitles: Record<string, string> = {}
  if (sweepstakeIds.length > 0) {
    const { data: swData } = await adminClient
      .from('sweepstakes')
      .select('id, title')
      .in('id', sweepstakeIds)
    sweepstakeTitles = Object.fromEntries((swData ?? []).map((sw) => [sw.id, sw.title]))
  }

  const activeSweepstake = sweepstakes.find((sw) => sw.status === 'active') ?? null

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          ← Back to Users
        </Link>
      </div>

      {/* Profile Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-zinc-500">Display Name</p>
            <p className="font-medium">{profile.display_name ?? '—'}</p>
          </div>
          <div>
            <p className="text-zinc-500">Username</p>
            <p className="font-medium">{profile.username ?? '—'}</p>
          </div>
          <div>
            <p className="text-zinc-500">Email</p>
            <p className="font-medium">{profile.email}</p>
          </div>
          <div>
            <p className="text-zinc-500">Phone</p>
            <p className="font-medium">{profile.phone ?? '—'}</p>
          </div>
          <div>
            <p className="text-zinc-500">Role</p>
            <p className="font-medium capitalize">{profile.role}</p>
          </div>
          <div>
            <p className="text-zinc-500">Joined</p>
            <p className="font-medium">{formatDate(profile.created_at)}</p>
          </div>
        </div>
      </div>

      {/* Subscription Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Subscription</h2>
        {subscription ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-zinc-500">Status</p>
              <p className="font-medium capitalize">{subscription.status}</p>
            </div>
            <div>
              <p className="text-zinc-500">Plan</p>
              <p className="font-medium">{subscription.price_id ?? '—'}</p>
            </div>
            {subscription.current_period_end && (
              <div>
                <p className="text-zinc-500">Current Period End</p>
                <p className="font-medium">{formatDate(subscription.current_period_end)}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-zinc-500">No active subscription.</p>
        )}
      </div>

      {/* Orders Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Orders ({orders.length})</h2>
        {orders.length === 0 ? (
          <p className="text-sm text-zinc-500">No orders.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Order #</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Amount</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Status</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Items</th>
                <th className="text-left py-2 font-medium text-zinc-500">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs">{order.order_number}</td>
                  <td className="py-2 pr-4">{formatCents(order.total_cents)}</td>
                  <td className="py-2 pr-4 capitalize">{order.status}</td>
                  <td className="py-2 pr-4">
                    {Array.isArray(order.order_items) ? order.order_items.length : 0}
                  </td>
                  <td className="py-2 text-zinc-500">{formatDate(order.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* E-books Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">E-books ({userEbooks.length})</h2>
        {userEbooks.length === 0 ? (
          <p className="text-sm text-zinc-500">No e-books.</p>
        ) : (
          <ul className="space-y-2">
            {userEbooks.map((ue, idx) => {
              const product = ue.products as unknown as { title: string }
              return (
                <li key={idx} className="flex items-center justify-between text-sm">
                  <span>{product?.title ?? '—'}</span>
                  <span className="text-zinc-500">
                    {ue.download_count} download{ue.download_count !== 1 ? 's' : ''} ·{' '}
                    {formatDate(ue.acquired_at)}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Entry Breakdown Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Entry Breakdown</h2>
        {entryVerifications.length === 0 ? (
          <p className="text-sm text-zinc-500">No sweepstake entries.</p>
        ) : (
          <div className="space-y-4">
            {entryVerifications.map((ev) => (
              <div key={ev.sweepstake_id} className="rounded-md border p-4 space-y-2">
                <p className="font-medium text-sm">
                  {sweepstakeTitles[ev.sweepstake_id] ?? ev.sweepstake_id}
                </p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-zinc-500 text-xs">Total</p>
                    <p className="font-bold text-lg">{ev.total_entries}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Purchase</p>
                    <p className="font-medium">{ev.purchase_entries}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Free</p>
                    <p className="font-medium">{ev.non_purchase_entries}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Admin</p>
                    <p className="font-medium">{ev.admin_entries}</p>
                  </div>
                  <div>
                    <p className="text-zinc-500 text-xs">Coupon Bonus</p>
                    <p className="font-medium">{ev.coupon_bonus_entries}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Entry History Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Entry History (last 50)</h2>
        {entryHistory.length === 0 ? (
          <p className="text-sm text-zinc-500">No entry history.</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Date</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Source</th>
                <th className="text-left py-2 font-medium text-zinc-500">Entries</th>
              </tr>
            </thead>
            <tbody>
              {entryHistory.map((entry, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2 pr-4 text-zinc-500">{formatDate(entry.created_at)}</td>
                  <td className="py-2 pr-4">
                    <div>
                      <span>{SOURCE_LABELS[entry.source] ?? entry.source}</span>
                      {entry.source === 'admin_adjustment' && entry.notes && (
                        <p className="text-xs text-zinc-400 mt-0.5">{entry.notes}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-2 font-medium">
                    <span
                      className={
                        entry.total_entries >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {entry.total_entries >= 0 ? '+' : ''}
                      {entry.total_entries}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Entry Adjustment Section */}
      <div className="rounded-lg border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Adjust Entries</h2>
        <UserEntryAdjustmentForm
          userId={id}
          sweepstakes={sweepstakes}
          activeSweepstakeId={activeSweepstake?.id ?? null}
        />
      </div>
    </div>
  )
}
