'use client'

import { useState } from 'react'

const NAV_LINKS = [
  { href: '/library', label: 'Library' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/marketplace', label: 'Marketplace' },
  { href: '/sweepstakes', label: 'Sweepstakes' },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-700 hover:bg-zinc-100"
        aria-label="Toggle menu"
      >
        <span className="text-xl">{open ? '✕' : '☰'}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-16 z-50 w-64 rounded-md border border-zinc-200 bg-white shadow-lg">
          <nav className="flex flex-col py-2">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </div>
  )
}
