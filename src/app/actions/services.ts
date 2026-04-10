'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils/slugify'

type AdminUserResult = { ok: false; error: string } | { ok: true; userId: string }

async function getAdminUser(): Promise<AdminUserResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Unauthorized' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') return { ok: false, error: 'Forbidden' }

  return { ok: true, userId: user.id }
}

async function generateServiceSlug(title: string): Promise<string> {
  const candidate = slugify(title)
  const { data: existing } = await adminClient
    .from('services')
    .select('id')
    .eq('slug', candidate)
    .maybeSingle()

  return existing ? `${candidate}-${crypto.randomUUID().slice(0, 6)}` : candidate
}

export async function createService(
  formData: FormData
): Promise<{ id: string; slug: string } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const title = formData.get('title')?.toString()
  const description = formData.get('description')?.toString() ?? null
  const long_description = formData.get('long_description')?.toString() ?? null
  const rate_type = formData.get('rate_type')?.toString()
  const rate_cents_str = formData.get('rate_cents')?.toString()
  const rate_label = formData.get('rate_label')?.toString() ?? null
  const category = formData.get('category')?.toString()
  const tagsRaw = formData.get('tags')?.toString() ?? ''

  if (!title) return { error: 'Title is required' }
  if (!rate_type) return { error: 'Rate type is required' }
  if (!category) return { error: 'Category is required' }

  let rate_cents: number | null = null
  if (rate_type === 'custom') {
    // rate_cents must be null for custom rate_type
    rate_cents = null
  } else {
    if (!rate_cents_str) return { error: 'Rate amount is required for non-custom rate type' }
    const parsed = parseInt(rate_cents_str, 10)
    if (isNaN(parsed) || parsed <= 0) return { error: 'Rate must be a positive integer' }
    rate_cents = parsed
  }

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const slug = await generateServiceSlug(title)

  const { data: service, error: serviceError } = await adminClient
    .from('services')
    .insert({
      title,
      description,
      long_description,
      slug,
      rate_type,
      rate_cents,
      rate_label,
      category,
      tags,
      status: 'pending',
      is_coming_soon: true,
    })
    .select('id, slug')
    .single()

  if (serviceError || !service) {
    return { error: serviceError?.message ?? 'Failed to create service' }
  }

  return { id: service.id, slug: service.slug }
}

export async function updateService(
  id: string,
  formData: FormData
): Promise<{ ok: true } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const title = formData.get('title')?.toString()
  const description = formData.get('description')?.toString() ?? null
  const long_description = formData.get('long_description')?.toString() ?? null
  const rate_type = formData.get('rate_type')?.toString()
  const rate_cents_str = formData.get('rate_cents')?.toString()
  const rate_label = formData.get('rate_label')?.toString() ?? null
  const category = formData.get('category')?.toString()
  const tagsRaw = formData.get('tags')?.toString() ?? ''
  const status = formData.get('status')?.toString() ?? null
  const is_coming_soon =
    formData.get('is_coming_soon') === 'true' || formData.get('is_coming_soon') === 'on'

  const cea_str = formData.get('custom_entry_amount')?.toString()
  let custom_entry_amount: number | null = null
  if (cea_str && cea_str.trim() !== '') {
    const ceaParsed = parseInt(cea_str, 10)
    if (isNaN(ceaParsed) || ceaParsed < 1) return { error: 'Entry amount must be a positive integer' }
    custom_entry_amount = ceaParsed
  }

  if (!title) return { error: 'Title is required' }
  if (!rate_type) return { error: 'Rate type is required' }
  if (!category) return { error: 'Category is required' }

  let rate_cents: number | null = null
  if (rate_type === 'custom') {
    rate_cents = null
  } else {
    if (!rate_cents_str) return { error: 'Rate amount is required for non-custom rate type' }
    const parsed = parseInt(rate_cents_str, 10)
    if (isNaN(parsed) || parsed <= 0) return { error: 'Rate must be a positive integer' }
    rate_cents = parsed
  }

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const { error: updateError } = await adminClient
    .from('services')
    .update({
      title,
      description,
      long_description,
      rate_type,
      rate_cents,
      rate_label,
      category,
      tags,
      status,
      is_coming_soon,
      custom_entry_amount,
    })
    .eq('id', id)

  if (updateError) return { error: updateError.message }

  revalidatePath('/admin/services')
  revalidatePath('/marketplace')

  return { ok: true }
}

export async function archiveService(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const { error } = await adminClient
    .from('services')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  return { ok: true }
}

export async function approveService(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const { error } = await adminClient
    .from('services')
    .update({ status: 'approved' })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/services')
  return { ok: true }
}
