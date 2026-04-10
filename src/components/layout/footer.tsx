export function Footer() {
  return (
    <footer className="border-t py-6 px-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex gap-4">
          <a href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </a>
          <a href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </a>
          <a href="/sweepstakes/rules" className="hover:text-foreground transition-colors">
            Sweepstakes Rules
          </a>
        </div>
        <p>&copy; {new Date().getFullYear()} Omni Incubator</p>
      </div>
    </footer>
  )
}
