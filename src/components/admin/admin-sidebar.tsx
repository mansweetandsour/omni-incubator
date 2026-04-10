import Link from 'next/link'

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

export function AdminSidebar() {
  return (
    <aside className="w-64 min-h-screen border-r bg-white dark:bg-zinc-900 flex flex-col">
      <div className="p-6 border-b">
        <span className="font-bold text-lg tracking-tight">Omni Incubator Admin</span>
      </div>
      <nav className="flex-1 py-4">
        <ul className="space-y-1 px-3">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
