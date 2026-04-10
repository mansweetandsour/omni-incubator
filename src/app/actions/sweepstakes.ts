'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

// ─── Sweepstake CRUD ──────────────────────────────────────────────────────────

export async function createSweepstake(formData: FormData): Promise<{ error?: string }> {
  const title = formData.get('title') as string
  if (!title) return { error: 'Title is required' }

  const prizeAmountDollars = formData.get('prize_amount_dollars') as string
  const prizeAmountCents = prizeAmountDollars
    ? Math.round(parseFloat(prizeAmountDollars) * 100)
    : null

  const { error } = await adminClient.from('sweepstakes').insert({
    title,
    description: (formData.get('description') as string) || null,
    prize_amount_cents: prizeAmountCents,
    prize_description: (formData.get('prize_description') as string) || null,
    start_at: (formData.get('start_at') as string) || null,
    end_at: (formData.get('end_at') as string) || null,
    non_purchase_entry_amount: parseInt(formData.get('non_purchase_entry_amount') as string) || 1,
    official_rules_url: (formData.get('official_rules_url') as string) || null,
    status: 'draft',
  })

  if (error) return { error: error.message }

  redirect('/admin/sweepstakes')
}

export async function updateSweepstake(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const title = formData.get('title') as string
  if (!title) return { error: 'Title is required' }

  const prizeAmountDollars = formData.get('prize_amount_dollars') as string
  const prizeAmountCents = prizeAmountDollars
    ? Math.round(parseFloat(prizeAmountDollars) * 100)
    : null

  const { error } = await adminClient
    .from('sweepstakes')
    .update({
      title,
      description: (formData.get('description') as string) || null,
      prize_amount_cents: prizeAmountCents,
      prize_description: (formData.get('prize_description') as string) || null,
      start_at: (formData.get('start_at') as string) || null,
      end_at: (formData.get('end_at') as string) || null,
      non_purchase_entry_amount:
        parseInt(formData.get('non_purchase_entry_amount') as string) || 1,
      official_rules_url: (formData.get('official_rules_url') as string) || null,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  redirect('/admin/sweepstakes')
}

export async function activateSweepstake(id: string): Promise<{ error?: string }> {
  // Pre-check: no other active sweepstake
  const { data: existing } = await adminClient
    .from('sweepstakes')
    .select('id, title')
    .eq('status', 'active')
    .neq('id', id)
    .maybeSingle()

  if (existing) {
    return { error: `Another sweepstake is already active: "${existing.title}"` }
  }

  const { error } = await adminClient
    .from('sweepstakes')
    .update({ status: 'active' })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidateTag('active-sweepstake', {})
  revalidateTag('active-multiplier', {})
  return {}
}

export async function endSweepstake(id: string): Promise<{ error?: string }> {
  const { error } = await adminClient
    .from('sweepstakes')
    .update({ status: 'ended' })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidateTag('active-sweepstake', {})
  revalidateTag('active-multiplier', {})
  return {}
}

// ─── Multiplier CRUD ──────────────────────────────────────────────────────────

export async function createMultiplier(
  sweepstakeId: string,
  formData: FormData
): Promise<{ error?: string; warning?: string }> {
  const name = formData.get('name') as string
  const multiplier = parseFloat(formData.get('multiplier') as string)
  const startAt = formData.get('start_at') as string
  const endAt = formData.get('end_at') as string

  if (!name || isNaN(multiplier) || !startAt || !endAt) {
    return { error: 'All fields are required' }
  }

  // Overlap check
  const { data: overlap } = await adminClient
    .from('entry_multipliers')
    .select('name')
    .eq('sweepstake_id', sweepstakeId)
    .eq('is_active', true)
    .lt('start_at', endAt)
    .gt('end_at', startAt)
    .limit(1)
    .maybeSingle()

  const { error } = await adminClient.from('entry_multipliers').insert({
    sweepstake_id: sweepstakeId,
    name,
    multiplier,
    start_at: startAt,
    end_at: endAt,
    is_active: true,
  })

  if (error) return { error: error.message }

  revalidateTag('active-multiplier', {})

  if (overlap) {
    return { warning: `Overlaps with: ${overlap.name}` }
  }
  return {}
}

export async function updateMultiplier(
  id: string,
  sweepstakeId: string,
  formData: FormData
): Promise<{ error?: string; warning?: string }> {
  const name = formData.get('name') as string
  const multiplier = parseFloat(formData.get('multiplier') as string)
  const startAt = formData.get('start_at') as string
  const endAt = formData.get('end_at') as string

  if (!name || isNaN(multiplier) || !startAt || !endAt) {
    return { error: 'All fields are required' }
  }

  // Overlap check
  const { data: overlap } = await adminClient
    .from('entry_multipliers')
    .select('name')
    .eq('sweepstake_id', sweepstakeId)
    .eq('is_active', true)
    .neq('id', id)
    .lt('start_at', endAt)
    .gt('end_at', startAt)
    .limit(1)
    .maybeSingle()

  const { error } = await adminClient
    .from('entry_multipliers')
    .update({ name, multiplier, start_at: startAt, end_at: endAt })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidateTag('active-multiplier', {})

  if (overlap) {
    return { warning: `Overlaps with: ${overlap.name}` }
  }
  return {}
}

export async function toggleMultiplier(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const { error } = await adminClient
    .from('entry_multipliers')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidateTag('active-multiplier', {})
  return {}
}

// ─── Coupon CRUD ──────────────────────────────────────────────────────────────

export async function createCoupon(formData: FormData): Promise<{ error?: string }> {
  const code = formData.get('code') as string
  if (!code) return { error: 'Code is required' }

  const entryType = formData.get('entry_type') as string
  const entryValue = parseFloat(formData.get('entry_value') as string)

  const maxUsesGlobalRaw = formData.get('max_uses_global') as string
  const maxUsesGlobal = maxUsesGlobalRaw ? parseInt(maxUsesGlobalRaw) : null

  const maxUsesPerUserRaw = formData.get('max_uses_per_user') as string
  const maxUsesPerUser = maxUsesPerUserRaw ? parseInt(maxUsesPerUserRaw) : 1

  const expiresAt = (formData.get('expires_at') as string) || null
  const sweepstakeId = (formData.get('sweepstake_id') as string) || null

  const { error } = await adminClient.from('coupons').insert({
    code: code.toUpperCase(),
    name: (formData.get('name') as string) || null,
    entry_type: entryType,
    entry_value: entryValue,
    max_uses_global: maxUsesGlobal,
    max_uses_per_user: maxUsesPerUser,
    expires_at: expiresAt,
    sweepstake_id: sweepstakeId,
    is_active: true,
    current_uses: 0,
  })

  if (error) return { error: error.message }

  redirect('/admin/coupons')
}

export async function updateCoupon(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const entryType = formData.get('entry_type') as string
  const entryValue = parseFloat(formData.get('entry_value') as string)

  const maxUsesGlobalRaw = formData.get('max_uses_global') as string
  const maxUsesGlobal = maxUsesGlobalRaw ? parseInt(maxUsesGlobalRaw) : null

  const maxUsesPerUserRaw = formData.get('max_uses_per_user') as string
  const maxUsesPerUser = maxUsesPerUserRaw ? parseInt(maxUsesPerUserRaw) : 1

  const expiresAt = (formData.get('expires_at') as string) || null
  const sweepstakeId = (formData.get('sweepstake_id') as string) || null

  // Note: code is excluded from update (immutable)
  const { error } = await adminClient
    .from('coupons')
    .update({
      name: (formData.get('name') as string) || null,
      entry_type: entryType,
      entry_value: entryValue,
      max_uses_global: maxUsesGlobal,
      max_uses_per_user: maxUsesPerUser,
      expires_at: expiresAt,
      sweepstake_id: sweepstakeId,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  redirect('/admin/coupons')
}

export async function toggleCoupon(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const { error } = await adminClient
    .from('coupons')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) return { error: error.message }
  return {}
}
