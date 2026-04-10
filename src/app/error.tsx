'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import * as Sentry from '@sentry/nextjs'

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h2 className="text-2xl font-semibold">Something went wrong</h2>
      <button
        onClick={reset}
        className="text-primary underline underline-offset-4 hover:no-underline"
      >
        Try again
      </button>
      <Link href="/" className="text-sm text-zinc-500 underline underline-offset-4 hover:no-underline">
        Go home
      </Link>
    </div>
  )
}
