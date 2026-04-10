import { unstable_cache } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'
import { MultiplierBannerClient } from './MultiplierBannerClient'

const getActiveMultiplier = unstable_cache(
  async () => {
    const { data } = await adminClient
      .from('entry_multipliers')
      .select('id, name, multiplier, end_at, sweepstakes!inner(status)')
      .eq('is_active', true)
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())
      .eq('sweepstakes.status', 'active')
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  },
  ['active-multiplier'],
  { revalidate: 60, tags: ['active-multiplier'] }
)

export default async function MultiplierBanner() {
  const data = await getActiveMultiplier()
  if (!data) return null
  return (
    <MultiplierBannerClient
      name={data.name}
      multiplier={Number(data.multiplier)}
      endAt={data.end_at ?? ''}
    />
  )
}
