import { createClient } from '@/lib/supabase/server'
import { Badge } from '@/components/ui/badge'
import { LeadCaptureForm } from '@/components/sweepstakes/LeadCapturePopup'

export const revalidate = 60

export default async function MarketplacePage() {
  const supabase = await createClient()

  const { data: services } = await supabase
    .from('services')
    .select('id, title, description, category, is_coming_soon')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <div className="container mx-auto py-16 px-4">
      {/* Hero */}
      <div className="text-center mb-16">
        <Badge variant="outline" className="mb-4 text-sm">
          Coming Soon
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight">Service Marketplace</h1>
        <p className="mt-4 text-lg text-zinc-500 max-w-xl mx-auto">
          A curated marketplace of vetted service providers to help you build, scale, and operate
          your business. Launching soon.
        </p>
      </div>

      {/* Service cards (if any) */}
      {services && services.length > 0 && (
        <div className="mb-16">
          <h2 className="text-xl font-bold mb-6">Available Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="rounded-lg border bg-white dark:bg-zinc-900 p-6 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold">{service.title}</h3>
                  {service.is_coming_soon && (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      Coming Soon
                    </Badge>
                  )}
                </div>
                {service.description && (
                  <p className="text-sm text-zinc-500 line-clamp-3">{service.description}</p>
                )}
                <Badge variant="secondary" className="text-xs">
                  {service.category}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Email capture */}
      <div className="max-w-md mx-auto rounded-lg border bg-white dark:bg-zinc-900 p-8">
        <h2 className="text-xl font-bold mb-2 text-center">Get notified when we launch</h2>
        <p className="text-sm text-zinc-500 mb-6 text-center">
          Be the first to know when the marketplace opens.
        </p>
        <LeadCaptureForm source="marketplace_coming_soon" />
      </div>
    </div>
  )
}
