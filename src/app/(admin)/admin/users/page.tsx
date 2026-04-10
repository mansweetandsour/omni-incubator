import Image from 'next/image'
import Link from 'next/link'
import { adminClient } from '@/lib/supabase/admin'

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>
}

type ProfileRow = {
  id: string
  display_name: string | null
  email: string
  phone: string | null
  username: string | null
  avatar_url: string | null
  role: string
  created_at: string
  subscriptions: Array<{ status: string }> | { status: string } | null
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ')
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function getSubStatus(row: ProfileRow): string | null {
  const sub = Array.isArray(row.subscriptions) ? row.subscriptions[0] : row.subscriptions
  return sub?.status ?? null
}

const SUB_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  trialing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  past_due: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  canceled: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
  incomplete: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  user: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400',
}

export default async function AdminUsersPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams

  let users: ProfileRow[] = []

  if (!q || q.trim() === '') {
    // Default: show most recent 20 users
    const { data } = await adminClient
      .from('profiles')
      .select(
        'id, display_name, email, phone, username, avatar_url, role, created_at, subscriptions(status)'
      )
      .order('created_at', { ascending: false })
      .limit(20)
    users = (data ?? []) as ProfileRow[]
  } else {
    const term = q.trim()

    // ILIKE search on profile fields
    const { data: byProfile } = await adminClient
      .from('profiles')
      .select(
        'id, display_name, email, phone, username, avatar_url, role, created_at, subscriptions(status)'
      )
      .or(
        `email.ilike.%${term}%,phone.ilike.%${term}%,display_name.ilike.%${term}%,username.ilike.%${term}%`
      )
      .limit(50)

    // Exact match on order_number
    const { data: byOrder } = await adminClient
      .from('orders')
      .select('user_id')
      .eq('order_number', term)
      .limit(10)

    const orderUserIds = (byOrder ?? []).map((o) => o.user_id).filter(Boolean)

    let profilesFromOrders: ProfileRow[] = []
    if (orderUserIds.length > 0) {
      const { data: orderProfiles } = await adminClient
        .from('profiles')
        .select(
          'id, display_name, email, phone, username, avatar_url, role, created_at, subscriptions(status)'
        )
        .in('id', orderUserIds)
      profilesFromOrders = (orderProfiles ?? []) as ProfileRow[]
    }

    // Merge and deduplicate by id
    const seen = new Set<string>()
    const merged: ProfileRow[] = []
    for (const p of [...(byProfile ?? []), ...profilesFromOrders]) {
      if (!seen.has(p.id)) {
        seen.add(p.id)
        merged.push(p as ProfileRow)
      }
    }
    users = merged
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Users</h1>

      {/* Search form */}
      <form method="GET" className="flex gap-2 max-w-md">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by email, name, username, or order #"
          className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Search
        </button>
        {q && (
          <a
            href="/admin/users"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-input bg-background px-3 text-sm hover:bg-muted transition-colors"
          >
            Clear
          </a>
        )}
      </form>

      {users.length === 0 ? (
        <p className="text-zinc-500">{q ? 'No users found.' : 'No users yet.'}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">User</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Email</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Role</th>
                <th className="text-left py-2 pr-4 font-medium text-zinc-500">Subscription</th>
                <th className="text-left py-2 font-medium text-zinc-500">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const initials = getInitials(user.display_name, user.email)
                const subStatus = getSubStatus(user)

                return (
                  <tr
                    key={user.id}
                    className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <Link
                        href={`/admin/users/${user.id}`}
                        className="flex items-center gap-3 group"
                      >
                        <div className="flex-shrink-0 h-8 w-8 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-semibold overflow-hidden">
                          {user.avatar_url ? (
                            <Image
                              src={user.avatar_url}
                              alt={user.display_name ?? user.email}
                              width={32}
                              height={32}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <span>{initials}</span>
                          )}
                        </div>
                        <span className="font-medium group-hover:underline">
                          {user.display_name ?? user.username ?? '(no name)'}
                        </span>
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {user.email}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLORS[user.role] ?? ROLE_COLORS.user}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {subStatus ? (
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${SUB_STATUS_COLORS[subStatus] ?? SUB_STATUS_COLORS.incomplete}`}
                        >
                          {subStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">none</span>
                      )}
                    </td>
                    <td className="py-3 text-zinc-500">
                      {new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
