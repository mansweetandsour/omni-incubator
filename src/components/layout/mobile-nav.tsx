'use client'

import { useState } from 'react'
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet'
import type { User } from '@supabase/supabase-js'

const navLinks = [
  { href: '/library', label: 'Library' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/sweepstakes', label: 'Sweepstakes' },
]

interface MobileNavProps {
  user: User | null
  username?: string | null
}

export function MobileNav({ user, username }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          className="flex md:hidden items-center justify-center w-9 h-9 rounded-md hover:bg-muted transition-colors"
          aria-label="Open menu"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72 pt-8">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>
        <nav className="flex flex-col gap-4">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="text-lg font-medium hover:text-primary transition-colors"
            >
              {link.label}
            </a>
          ))}
          <hr className="border-border" />
          {user ? (
            <>
              <a
                href="/profile"
                onClick={() => setOpen(false)}
                className="hover:text-primary transition-colors"
              >
                {username ? `@${username}` : 'Profile'}
              </a>
              <a
                href="/profile/ebooks"
                onClick={() => setOpen(false)}
                className="hover:text-primary transition-colors"
              >
                My E-books
              </a>
              <a
                href="/profile/orders"
                onClick={() => setOpen(false)}
                className="hover:text-primary transition-colors"
              >
                Orders
              </a>
              <a
                href="/profile/entries"
                onClick={() => setOpen(false)}
                className="hover:text-primary transition-colors"
              >
                Entries
              </a>
              <a
                href="/profile/subscription"
                onClick={() => setOpen(false)}
                className="hover:text-primary transition-colors"
              >
                Subscription
              </a>
            </>
          ) : (
            <a
              href="/login"
              onClick={() => setOpen(false)}
              className="text-primary font-medium hover:opacity-80"
            >
              Sign In
            </a>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
