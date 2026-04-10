import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
      <Link href="/" className="text-primary underline underline-offset-4 hover:no-underline">
        Go home
      </Link>
    </div>
  )
}
