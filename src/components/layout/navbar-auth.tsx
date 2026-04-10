'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import type { User } from '@supabase/supabase-js'

interface NavbarAuthProps {
  user: User | null
  username?: string | null
  avatarUrl?: string | null
}

export function NavbarAuth({ user, username, avatarUrl }: NavbarAuthProps) {
  const router = useRouter()
  const supabase = createClient()

  if (!user) {
    return (
      <Button variant="default" render={<a href="/login" />}>
        Sign In
      </Button>
    )
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.refresh()
  }

  const displayInitial =
    username?.charAt(0).toUpperCase() ?? user.email?.charAt(0).toUpperCase() ?? 'U'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 text-sm font-medium hover:opacity-80 focus:outline-none"
          aria-label="Account menu"
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold">
              {displayInitial}
            </div>
          )}
          <span className="hidden sm:block">{username ?? 'Account'}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <a href="/profile">Profile</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/profile/ebooks">My E-books</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/profile/orders">Orders</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/profile/entries">Entries</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/profile/subscription">Subscription</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
