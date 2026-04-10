'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { approveService } from '@/app/actions/services'

export function ServiceApproveButton({ serviceId }: { serviceId: string }) {
  const [isPending, startTransition] = useTransition()

  function handleApprove() {
    startTransition(async () => {
      const result = await approveService(serviceId)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Service approved')
      }
    })
  }

  return (
    <Button size="sm" variant="outline" disabled={isPending} onClick={handleApprove}>
      {isPending ? 'Approving…' : 'Approve'}
    </Button>
  )
}
