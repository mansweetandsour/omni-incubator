'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LeadCaptureForm } from '@/components/sweepstakes/LeadCapturePopup'

export function ServiceWaitlistCTA() {
  const [showForm, setShowForm] = useState(false)

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-sm">
      {!showForm && (
        <Button
          onClick={() => setShowForm(true)}
          variant="default"
          className="w-full"
        >
          Coming Soon — Join the waitlist
        </Button>
      )}
      {showForm && (
        <div className="w-full">
          <LeadCaptureForm source="marketplace_coming_soon" />
        </div>
      )}
    </div>
  )
}
