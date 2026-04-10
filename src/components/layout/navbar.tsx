import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavbarAuth } from './navbar-auth'
import { MobileNav } from './mobile-nav'

const navLinks = [
  { href: '/library', label: 'Library' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/sweepstakes', label: 'Sweepstakes' },
]

export async function Navbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile: { username: string | null; avatar_url: string | null } | null = null
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .single()
    profile = data
  }

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-bold text-xl tracking-tight">
            Omni Incubator
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <NavbarAuth
            user={user}
            username={profile?.username}
            avatarUrl={profile?.avatar_url}
          />
          <MobileNav user={user} username={profile?.username} />
        </div>
      </div>
    </header>
  )
}
