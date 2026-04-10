import Link from 'next/link'

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">403</h1>
      <p className="text-zinc-600">Access denied — admin only</p>
      <Link href="/" className="text-zinc-900 underline hover:no-underline">
        Go home
      </Link>
    </div>
  )
}
