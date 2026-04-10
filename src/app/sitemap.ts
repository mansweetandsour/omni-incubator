import type { MetadataRoute } from 'next'
import { adminClient } from '@/lib/supabase/admin'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE = 'https://omniincubator.org'

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, priority: 1.0, changeFrequency: 'daily' },
    { url: `${BASE}/library`, priority: 0.9, changeFrequency: 'daily' },
    { url: `${BASE}/pricing`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${BASE}/marketplace`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${BASE}/sweepstakes`, priority: 0.8, changeFrequency: 'daily' },
    { url: `${BASE}/sweepstakes/rules`, priority: 0.3, changeFrequency: 'monthly' },
    { url: `${BASE}/privacy`, priority: 0.2, changeFrequency: 'monthly' },
    { url: `${BASE}/terms`, priority: 0.2, changeFrequency: 'monthly' },
  ]

  const [{ data: ebooks }, { data: sampleProducts }, { data: services }] = await Promise.all([
    adminClient
      .from('products')
      .select('slug, updated_at')
      .eq('type', 'ebook')
      .eq('is_active', true)
      .is('deleted_at', null),
    adminClient
      .from('sample_products')
      .select('slug, updated_at')
      .eq('is_active', true)
      .is('deleted_at', null),
    adminClient
      .from('services')
      .select('slug, updated_at')
      .in('status', ['active', 'approved'])
      .is('deleted_at', null),
  ])

  const ebookRoutes: MetadataRoute.Sitemap = (ebooks ?? []).map((p) => ({
    url: `${BASE}/library/${p.slug}`,
    lastModified: p.updated_at ?? undefined,
    priority: 0.7,
    changeFrequency: 'weekly',
  }))

  const sampleRoutes: MetadataRoute.Sitemap = (sampleProducts ?? []).map((p) => ({
    url: `${BASE}/free/${p.slug}`,
    lastModified: p.updated_at ?? undefined,
    priority: 0.6,
    changeFrequency: 'weekly',
  }))

  const serviceRoutes: MetadataRoute.Sitemap = (services ?? []).map((s) => ({
    url: `${BASE}/marketplace/${s.slug}`,
    lastModified: s.updated_at ?? undefined,
    priority: 0.6,
    changeFrequency: 'weekly',
  }))

  return [...staticRoutes, ...ebookRoutes, ...sampleRoutes, ...serviceRoutes]
}
