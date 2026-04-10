'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { LeadCaptureForm } from '@/components/sweepstakes/LeadCapturePopup'

type ConfirmState =
  | { status: 'loading' }
  | {
      status: 'success'
      entries: number
      sweepstakeTitle: string
      prizeDescription: string | null
      activeMultiplier: number | null
    }
  | { status: 'already_confirmed'; entries: number }
  | { status: 'invalid' }
  | { status: 'expired'; email: string }

export default function ConfirmPage() {
  const params = useParams()
  const router = useRouter()
  const token = params?.token as string

  const [state, setState] = useState<ConfirmState>({ status: 'loading' })

  useEffect(() => {
    if (!token) {
      setState({ status: 'invalid' })
      return
    }

    async function confirm() {
      try {
        const res = await fetch('/api/lead-capture/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })

        const data = await res.json()

        if (res.status === 404) {
          setState({ status: 'invalid' })
          return
        }

        if (res.status === 410) {
          setState({ status: 'expired', email: data.email ?? '' })
          return
        }

        if (!res.ok) {
          setState({ status: 'invalid' })
          return
        }

        // Handle sample product redirect
        if (data.redirect) {
          router.replace(data.redirect)
          return
        }

        if (data.alreadyConfirmed) {
          setState({ status: 'already_confirmed', entries: data.entries ?? 0 })
          return
        }

        if (data.success) {
          setState({
            status: 'success',
            entries: data.entries ?? 0,
            sweepstakeTitle: data.sweepstake?.title ?? 'the sweepstake',
            prizeDescription: data.sweepstake?.prize_description ?? null,
            activeMultiplier: data.activeMultiplier ?? null,
          })
        }
      } catch {
        setState({ status: 'invalid' })
      }
    }

    confirm()
  }, [token, router])

  if (state.status === 'loading') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900" />
          <p className="text-sm text-zinc-500">Confirming your entry…</p>
        </div>
      </div>
    )
  }

  if (state.status === 'success') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-3">
            <p className="text-4xl">✅</p>
            <h1 className="text-2xl font-bold">You&apos;re in!</h1>
            <p className="text-zinc-600">
              You earned{' '}
              <span className="font-semibold text-zinc-900">{state.entries}</span>{' '}
              {state.entries === 1 ? 'entry' : 'entries'} in the{' '}
              <span className="font-semibold">{state.sweepstakeTitle}</span> sweepstake.
            </p>
            {state.prizeDescription && (
              <p className="text-sm text-zinc-500">{state.prizeDescription}</p>
            )}
          </div>

          {state.activeMultiplier && state.activeMultiplier > 1 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 font-medium">
              🔥 {state.activeMultiplier}X entry bonus active on all purchases!
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/library"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 dark:bg-white px-6 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Browse Library
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Join Membership
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'already_confirmed') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-3">
            <p className="text-4xl">🎟️</p>
            <h1 className="text-2xl font-bold">Already confirmed!</h1>
            <p className="text-zinc-600">
              You&apos;ve already confirmed your entry. You have{' '}
              <span className="font-semibold text-zinc-900">{state.entries}</span>{' '}
              {state.entries === 1 ? 'entry' : 'entries'} in the sweepstake.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/library"
              className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 dark:bg-white px-6 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
            >
              Browse Library
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Join Membership
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (state.status === 'expired') {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="space-y-3">
            <p className="text-4xl">⏰</p>
            <h1 className="text-2xl font-bold">Link expired</h1>
            <p className="text-zinc-600">
              This confirmation link has expired (72 hours). Enter your email again
              to get a new one.
            </p>
          </div>
          <div className="text-left">
            <LeadCaptureForm source="popup" />
          </div>
        </div>
      </div>
    )
  }

  // invalid state
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-3">
          <p className="text-4xl">❌</p>
          <h1 className="text-2xl font-bold">Invalid link</h1>
          <p className="text-zinc-600">
            This confirmation link is invalid. Submit your email again to get a
            new one.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-10 items-center justify-center rounded-md border border-zinc-300 px-6 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  )
}
