// server-only — do not import in client components
import { adminClient } from './supabase/admin'

export async function isActiveMember(userId: string): Promise<boolean> {
  if (!userId) return false
  const { data } = await adminClient
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .in('status', ['trialing', 'active'])
    .maybeSingle()
  return !!data
}
