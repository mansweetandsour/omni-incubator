'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const navItems = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/ebooks', label: 'E-books' },
  { href: '/admin/sample-products', label: 'Sample Products' },
  { href: '/admin/services', label: 'Services' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/sweepstakes', label: 'Sweepstakes' },
  { href: '/admin/coupons', label: 'Coupons' },
  { href: '/admin/settings', label: 'Settings' },
]

interface NavLinksProps {
  onNavigate?: () => void
}

function NavLinks({ onNavigate }: NavLinksProps) {
  return (
    <nav className="flex-1 py-4">
      <ul className="space-y-1 px-3">
        {navItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function AdminSidebar() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Mobile hamburger — fixed top-left, hidden on md+ */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Open navigation menu"
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              <Menu className="size-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <SheetTitle className="sr-only">Admin Navigation</SheetTitle>
            <div className="flex flex-col h-full bg-white dark:bg-zinc-900">
              <div className="p-6 border-b">
                <span className="font-bold text-lg tracking-tight">Omni Incubator Admin</span>
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden md:flex w-64 min-h-screen border-r bg-white dark:bg-zinc-900 flex-col">
        <div className="p-6 border-b">
          <span className="font-bold text-lg tracking-tight">Omni Incubator Admin</span>
        </div>
        <NavLinks />
      </aside>
    </>
  )
}
