'use client'

import { useState } from 'react'

type FormState = 'idle' | 'loading' | 'success' | 'duplicate' | 'error'

interface LeadCaptureFormFreeProps {
  productId: string
  requirePhone: boolean
}

export function LeadCaptureFormFree({ productId, requirePhone }: LeadCaptureFormFreeProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    setState('loading')

    try {
      const body: Record<string, string> = {
        email,
        source: 'sample_product',
        sampleProductId: productId,
      }
      if (requirePhone && phone) {
        body.phone = phone
      }

      const res = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = (await res.json()) as {
        success?: boolean
        duplicate?: boolean
        error?: string
      }

      if (!res.ok && !data.duplicate) {
        setState('error')
        setErrorMsg(data.error ?? 'Something went wrong. Please try again.')
        return
      }

      if (data.duplicate) {
        setState('duplicate')
        return
      }

      setState('success')
    } catch {
      setState('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  if (state === 'success') {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-6 text-center space-y-2">
        <p className="text-2xl">📧</p>
        <p className="font-semibold">Check your email!</p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Click the confirmation link to unlock your free download and earn your entries.
        </p>
      </div>
    )
  }

  if (state === 'duplicate') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-6 text-center space-y-2">
        <p className="text-2xl">📧</p>
        <p className="font-semibold text-sm">
          You&apos;ve already entered with this email — check your inbox.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {errorMsg && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 text-sm">
          {errorMsg}
        </div>
      )}

      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="lc-email">
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          id="lc-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      {requirePhone && (
        <div className="space-y-1">
          <label className="block text-sm font-medium" htmlFor="lc-phone">
            Phone number <span className="text-red-500">*</span>
          </label>
          <input
            id="lc-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required={requirePhone}
            placeholder="+1 (555) 000-0000"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full inline-flex h-10 items-center justify-center rounded-lg bg-zinc-900 dark:bg-white px-6 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === 'loading' ? (
          <span className="flex items-center gap-2">
            <svg
              className="animate-spin h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Sending…
          </span>
        ) : (
          'Get Free Access'
        )}
      </button>

      <p className="text-xs text-zinc-400 text-center">
        No spam. Unsubscribe at any time.
      </p>
    </form>
  )
}
