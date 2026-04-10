'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { archiveService } from '@/app/actions/services'
import { ServiceApproveButton } from '@/components/marketplace/ServiceApproveButton'

interface Service {
  id: string
  title: string
  category: string
  rate_type: string
  rate_cents: number | null
  rate_label: string | null
  status: string | null
  is_coming_soon: boolean
  deleted_at: string | null
}

interface ServiceTableProps {
  services: Service[]
}

function formatRate(service: Service): string {
  if (service.rate_label) return service.rate_label
  if (service.rate_type === 'custom' || service.rate_cents == null) return 'Custom'
  const amount = `$${(service.rate_cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`
  if (service.rate_type === 'hourly') return `${amount}/hr`
  if (service.rate_type === 'fixed') return `${amount} fixed`
  if (service.rate_type === 'monthly') return `${amount}/mo`
  return amount
}

export function ServiceTable({ services }: ServiceTableProps) {
  const [archivingId, setArchivingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function handleArchive(id: string) {
    setArchivingId(id)
    startTransition(async () => {
      const result = await archiveService(id)
      setArchivingId(null)
      if ('error' in result) {
        toast.error(result.error)
      } else {
        toast.success('Service archived')
      }
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Rate</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Coming Soon</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {services.map((service) => {
          const isArchived = !!service.deleted_at
          return (
            <TableRow key={service.id} className={isArchived ? 'opacity-60' : ''}>
              <TableCell className="font-medium max-w-xs truncate">{service.title}</TableCell>
              <TableCell>{service.category}</TableCell>
              <TableCell>{formatRate(service)}</TableCell>
              <TableCell>
                {isArchived ? (
                  <Badge variant="destructive">Archived</Badge>
                ) : (
                  <Badge variant="secondary">{service.status ?? 'pending'}</Badge>
                )}
              </TableCell>
              <TableCell>
                {service.is_coming_soon ? (
                  <Badge variant="outline">Coming Soon</Badge>
                ) : (
                  <span className="text-zinc-400 text-sm">No</span>
                )}
              </TableCell>
              <TableCell className="text-right space-x-2">
                <Link href={`/admin/services/${service.id}/edit`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
                  Edit
                </Link>
                {!isArchived && service.status === 'pending' && (
                  <ServiceApproveButton serviceId={service.id} />
                )}
                {!isArchived && (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={archivingId === service.id}
                    onClick={() => handleArchive(service.id)}
                  >
                    {archivingId === service.id ? '…' : 'Archive'}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
