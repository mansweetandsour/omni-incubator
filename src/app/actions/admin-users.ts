'use server'

import { adminClient } from '@/lib/supabase/admin'
import { refreshEntryVerification } from '@/lib/sweepstakes'
import { revalidatePath } from 'next/cache'

export async function adjustUserEntries(
  userId: string,
  sweepstakeId: string,
  entries: number,
  notes: string
): Promise<{ success?: boolean; error?: string }> {
  if (entries === 0) return { error: 'Entries must be non-zero' }
  if (!notes || notes.trim().length === 0) return { error: 'Notes are required' }
  if (!/^[0-9a-f-]{36}$/i.test(sweepstakeId)) return { error: 'Invalid sweepstake' }

  const { error } = await adminClient.from('sweepstake_entries').insert({
    sweepstake_id: sweepstakeId,
    user_id: userId,
    source: 'admin_adjustment',
    base_entries: entries,
    multiplier: 1.0,
    coupon_multiplier: 1.0,
    coupon_id: null,
    bonus_entries: 0,
    total_entries: entries,
    list_price_cents: 0,
    amount_cents: 0,
    notes: notes.trim(),
  })

  if (error) return { error: error.message }

  await refreshEntryVerification()
  revalidatePath('/admin/users/' + userId)

  return { success: true }
}
