import { unstable_cache } from 'next/cache'
import { adminClient } from '@/lib/supabase/admin'

const getActiveSweepstakeData = unstable_cache(
  async () => {
    const { data: sw } = await adminClient
      .from('sweepstakes')
      .select('id')
      .eq('status', 'active')
      .maybeSingle()
    if (!sw) return null
    const { data: mult } = await adminClient
      .from('entry_multipliers')
      .select('multiplier')
      .eq('sweepstake_id', sw.id)
      .eq('is_active', true)
      .lte('start_at', new Date().toISOString())
      .gte('end_at', new Date().toISOString())
      .order('multiplier', { ascending: false })
      .limit(1)
      .maybeSingle()
    return { sweepstakeId: sw.id, activeMultiplier: mult ? Number(mult.multiplier) : null }
  },
  ['active-sweepstake'],
  { revalidate: 60, tags: ['active-sweepstake'] }
)

interface EntryBadgeProps {
  product: { price_cents: number; custom_entry_amount: number | null }
  className?: string
}

export async function EntryBadge({ product, className }: EntryBadgeProps) {
  const data = await getActiveSweepstakeData()
  if (!data) return null
  const base = product.custom_entry_amount ?? Math.floor(product.price_cents / 100)
  if (data.activeMultiplier) {
    const earned = Math.floor(base * data.activeMultiplier)
    return (
      <span className={`text-xs font-semibold text-orange-600 ${className ?? ''}`}>
        🔥 {data.activeMultiplier}X ENTRIES — Earn {earned} entries
      </span>
    )
  }
  return (
    <span className={`text-xs font-medium text-zinc-500 ${className ?? ''}`}>
      🎟️ Earn {base} entries
    </span>
  )
}
