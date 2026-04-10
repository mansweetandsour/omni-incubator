import { adminClient } from '@/lib/supabase/admin'
import { LeadCapturePopup } from './LeadCapturePopup'

export async function LeadCapturePopupWrapper() {
  const { data: sw } = await adminClient
    .from('sweepstakes')
    .select('prize_amount_cents')
    .eq('status', 'active')
    .maybeSingle()

  if (!sw) return null

  const prizeAmount = sw.prize_amount_cents
    ? `$${(sw.prize_amount_cents / 100).toLocaleString('en-US')}`
    : 'an amazing prize'

  return <LeadCapturePopup prizeAmount={prizeAmount} />
}
