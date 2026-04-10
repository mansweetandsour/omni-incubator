import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { adminClient } from '@/lib/supabase/admin'
import { Badge } from '@/components/ui/badge'
import { EntryBadge } from '@/components/sweepstakes/EntryBadge'
import { ServiceWaitlistCTA } from '@/components/marketplace/ServiceWaitlistCTA'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const revalidate = 60

interface ServiceDetailPageProps {
  params: Promise<{ slug: string }>
}

function formatServiceRate(service: {
  rate_type: string
  rate_cents: number | null
  rate_label: string | null
}): string {
  if (service.rate_label) return service.rate_label
  if (service.rate_type === 'custom' || service.rate_cents == null) return 'Contact for pricing'
  const amt = (service.rate_cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
  if (service.rate_type === 'hourly') return `${amt}/hr`
  if (service.rate_type === 'fixed') return `${amt} fixed`
  if (service.rate_type === 'monthly') return `${amt}/mo`
  return amt
}

export async function generateMetadata({ params }: ServiceDetailPageProps) {
  const { slug } = await params
  const { data: service } = await adminClient
    .from('services')
    .select('title, description')
    .eq('slug', slug)
    .maybeSingle()
  if (!service) return { title: 'Service Not Found' }
  return {
    title: service.title,
    description: service.description ?? undefined,
    openGraph: {
      images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
    },
  }
}

export default async function ServiceDetailPage({ params }: ServiceDetailPageProps) {
  const { slug } = await params

  const { data: service } = await adminClient
    .from('services')
    .select('*, profiles!provider_id(display_name)')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle()

  if (!service) notFound()
  if (service.status !== 'active' && service.status !== 'approved') notFound()

  const providerName =
    (service.profiles as { display_name: string } | null)?.display_name ?? null

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="relative">
        {/* Page content — always rendered, visible through overlay */}
        <div className="space-y-4">
          <h1 className="text-3xl font-bold tracking-tight">{service.title}</h1>
          {providerName && (
            <p className="text-sm text-zinc-500">By {providerName}</p>
          )}
          <p className="text-lg font-semibold">{formatServiceRate(service)}</p>
          {service.description && (
            <p className="text-zinc-600 dark:text-zinc-400">{service.description}</p>
          )}
          {service.custom_entry_amount != null && service.custom_entry_amount > 0 && (
            <Suspense fallback={null}>
              <EntryBadge
                product={{ price_cents: 0, custom_entry_amount: service.custom_entry_amount }}
              />
            </Suspense>
          )}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{service.category}</Badge>
            {service.tags?.map((tag: string) => (
              <Badge key={tag} variant="outline">{tag}</Badge>
            ))}
          </div>
          {service.long_description && (
            <div className="prose prose-zinc max-w-none dark:prose-invert mt-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {service.long_description}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Coming Soon overlay */}
        {service.is_coming_soon && (
          <div className="absolute inset-0 bg-white/85 dark:bg-zinc-900/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4 rounded-lg p-8 text-center">
            <Badge variant="outline" className="text-sm">Coming Soon</Badge>
            <h2 className="text-xl font-semibold">This service is launching soon</h2>
            <p className="text-sm text-zinc-500 max-w-xs">
              Join the waitlist to be notified when this service becomes available.
            </p>
            <ServiceWaitlistCTA />
          </div>
        )}
      </div>
    </div>
  )
}
