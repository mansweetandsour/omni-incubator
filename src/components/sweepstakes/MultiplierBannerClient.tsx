'use client'

import { useState } from 'react'

interface MultiplierBannerClientProps {
  name: string
  multiplier: number
  endAt: string
}

export function MultiplierBannerClient({ name, multiplier, endAt }: MultiplierBannerClientProps) {
  const [show, setShow] = useState(true)

  if (!show) return null

  const formattedEnd = new Date(endAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <div className="w-full bg-amber-400 text-amber-950 text-sm py-2 px-4 flex items-center justify-between">
      <span>
        {name} — {multiplier}X entries on all purchases! Ends {formattedEnd}
      </span>
      <button
        onClick={() => setShow(false)}
        aria-label="Dismiss banner"
        className="ml-4 font-bold hover:opacity-70 transition-opacity"
      >
        ✕
      </button>
    </div>
  )
}
