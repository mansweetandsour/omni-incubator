'use server'

import { adminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createSampleProduct(
  formData: FormData
): Promise<{ error?: string }> {
  const title = (formData.get('title') as string)?.trim()
  const slug = (formData.get('slug') as string)?.trim()

  if (!title) return { error: 'Title is required' }

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens only' }
  }

  // Slug uniqueness check
  const { data: existing } = await adminClient
    .from('sample_products')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (existing) return { error: 'Slug already exists' }

  const description = (formData.get('description') as string) || null
  const longDescription = (formData.get('long_description') as string) || null
  const requirePhone = formData.get('require_phone') === 'true' || formData.get('require_phone') === 'on'
  const upsellProductId = (formData.get('upsell_product_id') as string) || null
  const upsellMembership = formData.get('upsell_membership') === 'true' || formData.get('upsell_membership') === 'on'
  const upsellHeading = (formData.get('upsell_heading') as string) || null
  const upsellBody = (formData.get('upsell_body') as string) || null
  const customEntryAmountRaw = formData.get('custom_entry_amount') as string
  const customEntryAmount =
    customEntryAmountRaw && customEntryAmountRaw.trim() !== ''
      ? parseInt(customEntryAmountRaw, 10)
      : null
  if (customEntryAmount !== null && customEntryAmount < 1) {
    return { error: 'Custom entry amount must be at least 1' }
  }
  const isActive = formData.get('is_active') !== 'false'

  const { error } = await adminClient.from('sample_products').insert({
    title,
    slug,
    description,
    long_description: longDescription,
    require_email: true,
    require_phone: requirePhone,
    upsell_product_id: upsellProductId || null,
    upsell_membership: upsellMembership,
    upsell_heading: upsellHeading,
    upsell_body: upsellBody,
    custom_entry_amount: customEntryAmount,
    is_active: isActive,
    file_path: '',
  })

  if (error) return { error: error.message }

  redirect('/admin/sample-products')
}

export async function updateSampleProduct(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const title = (formData.get('title') as string)?.trim()
  const slug = (formData.get('slug') as string)?.trim()

  if (!title) return { error: 'Title is required' }

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { error: 'Slug must be lowercase letters, numbers, and hyphens only' }
  }

  // Slug uniqueness check — exclude current id
  const { data: existing } = await adminClient
    .from('sample_products')
    .select('id')
    .eq('slug', slug)
    .neq('id', id)
    .maybeSingle()

  if (existing) return { error: 'Slug already exists' }

  const description = (formData.get('description') as string) || null
  const longDescription = (formData.get('long_description') as string) || null
  const requirePhone = formData.get('require_phone') === 'true' || formData.get('require_phone') === 'on'
  const upsellProductId = (formData.get('upsell_product_id') as string) || null
  const upsellMembership = formData.get('upsell_membership') === 'true' || formData.get('upsell_membership') === 'on'
  const upsellHeading = (formData.get('upsell_heading') as string) || null
  const upsellBody = (formData.get('upsell_body') as string) || null
  const customEntryAmountRaw = formData.get('custom_entry_amount') as string
  const customEntryAmount =
    customEntryAmountRaw && customEntryAmountRaw.trim() !== ''
      ? parseInt(customEntryAmountRaw, 10)
      : null
  if (customEntryAmount !== null && customEntryAmount < 1) {
    return { error: 'Custom entry amount must be at least 1' }
  }
  const isActive = formData.get('is_active') !== 'false'

  const { error } = await adminClient
    .from('sample_products')
    .update({
      title,
      slug,
      description,
      long_description: longDescription,
      require_phone: requirePhone,
      upsell_product_id: upsellProductId || null,
      upsell_membership: upsellMembership,
      upsell_heading: upsellHeading,
      upsell_body: upsellBody,
      custom_entry_amount: customEntryAmount,
      is_active: isActive,
    })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/sample-products')
  return {}
}

export async function toggleSampleProductActive(
  id: string,
  isActive: boolean
): Promise<{ error?: string }> {
  const { error } = await adminClient
    .from('sample_products')
    .update({ is_active: isActive })
    .eq('id', id)

  if (error) return { error: error.message }

  revalidatePath('/admin/sample-products')
  return {}
}
