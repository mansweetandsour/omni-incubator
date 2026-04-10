import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavbarAuth } from './navbar-auth'
import { MobileNav } from './mobile-nav'

const NAV_LINKS = [
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

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
      <div className="container relative mx-auto flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="text-lg font-bold text-zinc-900">
          Omni Incubator
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-zinc-600 hover:text-zinc-900"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-2">
          <NavbarAuth user={user} />
          <MobileNav />
        </div>
      </div>
    </header>
  )
}
