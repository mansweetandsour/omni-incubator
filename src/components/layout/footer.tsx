export function Footer() {
  return (
    <footer className="border-t border-zinc-200 py-8">
      <div className="container mx-auto flex flex-col items-center gap-4 px-4 text-sm text-zinc-500 sm:flex-row sm:justify-between">
        <p>&copy; {new Date().getFullYear()} Omni Incubator</p>
        <nav className="flex gap-4">
          <a href="/privacy" className="hover:text-zinc-900">
            Privacy
          </a>
          <a href="/terms" className="hover:text-zinc-900">
            Terms
          </a>
          <a href="/sweepstakes" className="hover:text-zinc-900">
            Sweepstakes Rules
          </a>
        </nav>
      </div>
    </footer>
  )
}
