'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type User = Record<string, any> | null

interface NavbarAuthProps {
  user: User
}

export function NavbarAuth({ user }: NavbarAuthProps) {
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.refresh()
  }

  if (!user) {
    return (
      <a
        href="/login"
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
      >
        Sign In
      </a>
    )
  }

  const initials = (user.email as string)?.[0]?.toUpperCase() ?? 'U'

  return (
    <div className="relative flex items-center gap-2">
      <a href="/profile" className="flex items-center gap-2 text-sm text-zinc-700 hover:text-zinc-900">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold">
          {initials}
        </div>
      </a>
      <button
        onClick={handleSignOut}
        className="text-sm text-zinc-500 hover:text-zinc-700"
      >
        Sign out
      </button>
    </div>
  )
}
