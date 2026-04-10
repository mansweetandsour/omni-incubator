'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ─── LeadCaptureForm ──────────────────────────────────────────────────────────

export interface LeadCaptureFormProps {
  prizeAmount?: string
  source?: 'popup' | 'footer' | 'marketplace_coming_soon'
  onSuccess?: () => void
}

type FormState = 'idle' | 'loading' | 'success' | 'error'

export function LeadCaptureForm({
  prizeAmount,
  source = 'popup',
  onSuccess,
}: LeadCaptureFormProps) {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState<FormState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleResend() {
    if (!email) return
    setState('loading')
    try {
      await fetch('/api/lead-capture/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
    } catch {
      // silently ignore
    }
    setState('success')
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrorMsg(null)
    setState('loading')

    try {
      const res = await fetch('/api/lead-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phone: phone || undefined, source }),
      })
      const data = await res.json()

      if (!res.ok) {
        setState('error')
        setErrorMsg(data?.error ?? 'Something went wrong. Please try again.')
        return
      }

      if (data.duplicate) {
        setState('success') // already entered — still show success
        onSuccess?.()
        return
      }

      setState('success')
      localStorage.setItem('omni_popup_submitted', '1')
      onSuccess?.()
    } catch {
      setState('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  if (state === 'success') {
    return (
      <div className="text-center space-y-3 py-2">
        <p className="text-2xl">📧</p>
        <p className="font-semibold text-sm">Check your email to confirm your entry!</p>
        <p className="text-xs text-zinc-500">
          We sent a confirmation link to{' '}
          <span className="font-medium">{email}</span>.
        </p>
        <button
          type="button"
          onClick={handleResend}
          className="text-xs text-blue-600 underline hover:text-blue-800"
        >
          Resend email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {prizeAmount && (
        <p className="text-sm text-zinc-500 text-center">
          Enter for a chance to win{' '}
          <span className="font-semibold text-zinc-900">{prizeAmount}</span>!
        </p>
      )}

      {errorMsg && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {errorMsg}
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">
          Email address <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@example.com"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-700 mb-1">
          Phone number <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 (555) 000-0000"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            Entering…
          </span>
        ) : (
          'Enter Sweepstakes'
        )}
      </button>

      <p className="text-xs text-zinc-400 text-center">
        No spam. Unsubscribe at any time.
      </p>
    </form>
  )
}

// ─── LeadCapturePopup ─────────────────────────────────────────────────────────

export interface LeadCapturePopupProps {
  prizeAmount: string
}

export function LeadCapturePopup({ prizeAmount }: LeadCapturePopupProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Check suppression flags
    if (localStorage.getItem('omni_popup_submitted')) return
    const dismissed = localStorage.getItem('omni_popup_dismissed')
    if (dismissed) {
      const age = Date.now() - new Date(dismissed).getTime()
      if (age < 30 * 24 * 3600 * 1000) return // re-show after 30 days
    }

    let triggered = false
    const triggerOpen = () => {
      if (!triggered) {
        triggered = true
        setOpen(true)
      }
    }

    const timer = setTimeout(triggerOpen, 10_000)
    const onScroll = () => {
      if (window.scrollY >= document.body.scrollHeight * 0.5) triggerOpen()
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  function handleOpenChange(value: boolean) {
    if (!value) {
      localStorage.setItem('omni_popup_dismissed', new Date().toISOString())
    }
    setOpen(value)
  }

  function handleSuccess() {
    // Keep dialog open in success state — suppress future shows
    localStorage.setItem('omni_popup_submitted', '1')
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            🎟️ Win {prizeAmount}!
          </DialogTitle>
        </DialogHeader>
        <div className="mt-2">
          <LeadCaptureForm
            prizeAmount={prizeAmount}
            source="popup"
            onSuccess={handleSuccess}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
