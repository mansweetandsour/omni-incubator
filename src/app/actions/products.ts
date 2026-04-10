'use server'

import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'
import { slugify } from '@/lib/utils/slugify'
import { syncStripeProduct, syncStripeNewPrices } from '@/lib/stripe'

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

async function generateProductSlug(title: string): Promise<string> {
  const candidate = slugify(title)
  const { data: existing } = await adminClient
    .from('products')
    .select('id')
    .eq('slug', candidate)
    .maybeSingle()

  return existing ? `${candidate}-${crypto.randomUUID().slice(0, 6)}` : candidate
}

export async function createProduct(
  formData: FormData
): Promise<{ id: string; slug: string } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const title = formData.get('title')?.toString()
  const description = formData.get('description')?.toString()
  const long_description = formData.get('long_description')?.toString() ?? null
  const priceStr = formData.get('price_cents')?.toString()
  const category = formData.get('category')?.toString()
  const subcategory = formData.get('subcategory')?.toString() ?? null
  const operator_dependency = formData.get('operator_dependency')?.toString() ?? null
  const scale_potential = formData.get('scale_potential')?.toString() ?? null
  const cost_to_start = formData.get('cost_to_start')?.toString() ?? null
  const tagsRaw = formData.get('tags')?.toString() ?? ''
  const is_active = formData.get('is_active') === 'true' || formData.get('is_active') === 'on'
  const is_coming_soon =
    formData.get('is_coming_soon') === 'true' || formData.get('is_coming_soon') === 'on'
  const custom_entry_amount_str = formData.get('custom_entry_amount')?.toString()

  if (!title) return { error: 'Title is required' }
  if (!description) return { error: 'Description is required' }
  if (!priceStr) return { error: 'Price is required' }
  if (!category) return { error: 'Category is required' }

  const price_cents = parseInt(priceStr, 10)
  if (isNaN(price_cents) || price_cents < 0) return { error: 'Invalid price' }

  const custom_entry_amount =
    custom_entry_amount_str ? parseInt(custom_entry_amount_str, 10) : null

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  const slug = await generateProductSlug(title)

  const { data: product, error: productError } = await adminClient
    .from('products')
    .insert({
      type: 'ebook',
      title,
      description,
      long_description,
      price_cents,
      is_active,
      is_coming_soon,
      custom_entry_amount,
      slug,
    })
    .select('id, slug, member_price_cents')
    .single()

  if (productError || !product) {
    return { error: productError?.message ?? 'Failed to create product' }
  }

  const { error: ebookError } = await adminClient.from('ebooks').insert({
    product_id: product.id,
    file_path: '',
    category,
    subcategory,
    authors: [],
    operator_dependency,
    scale_potential,
    cost_to_start,
    tags,
  })

  if (ebookError) {
    return { error: ebookError.message }
  }

  // Fire-and-forget Stripe sync
  syncStripeProduct(product.id).catch(console.error)

  return { id: product.id, slug: product.slug }
}

export async function updateProduct(
  id: string,
  formData: FormData
): Promise<{ ok: true; priceChanged: boolean } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const title = formData.get('title')?.toString()
  const description = formData.get('description')?.toString()
  const long_description = formData.get('long_description')?.toString() ?? null
  const priceStr = formData.get('price_cents')?.toString()
  const category = formData.get('category')?.toString()
  const subcategory = formData.get('subcategory')?.toString() ?? null
  const operator_dependency = formData.get('operator_dependency')?.toString() ?? null
  const scale_potential = formData.get('scale_potential')?.toString() ?? null
  const cost_to_start = formData.get('cost_to_start')?.toString() ?? null
  const tagsRaw = formData.get('tags')?.toString() ?? ''
  const is_active = formData.get('is_active') === 'true' || formData.get('is_active') === 'on'
  const is_coming_soon =
    formData.get('is_coming_soon') === 'true' || formData.get('is_coming_soon') === 'on'
  const custom_entry_amount_str = formData.get('custom_entry_amount')?.toString()

  if (!title) return { error: 'Title is required' }
  if (!description) return { error: 'Description is required' }
  if (!priceStr) return { error: 'Price is required' }
  if (!category) return { error: 'Category is required' }

  const price_cents = parseInt(priceStr, 10)
  if (isNaN(price_cents) || price_cents < 0) return { error: 'Invalid price' }

  const custom_entry_amount =
    custom_entry_amount_str ? parseInt(custom_entry_amount_str, 10) : null

  const tags = tagsRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

  // Read current price_cents to detect change
  const { data: current } = await adminClient
    .from('products')
    .select('price_cents')
    .eq('id', id)
    .single()

  const priceChanged = current ? current.price_cents !== price_cents : false

  const { data: updated, error: updateError } = await adminClient
    .from('products')
    .update({
      title,
      description,
      long_description,
      price_cents,
      is_active,
      is_coming_soon,
      custom_entry_amount,
    })
    .eq('id', id)
    .select('member_price_cents')
    .single()

  if (updateError || !updated) {
    return { error: updateError?.message ?? 'Failed to update product' }
  }

  const { error: ebookUpdateError } = await adminClient
    .from('ebooks')
    .update({
      category,
      subcategory,
      operator_dependency,
      scale_potential,
      cost_to_start,
      tags,
    })
    .eq('product_id', id)

  if (ebookUpdateError) {
    return { error: ebookUpdateError.message }
  }

  if (priceChanged) {
    // Fire-and-forget — memberPriceCents from DB
    syncStripeNewPrices(id, updated.member_price_cents).catch(console.error)
  }

  return { ok: true, priceChanged }
}

export async function archiveProduct(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const auth = await getAdminUser()
  if (!auth.ok) return { error: auth.error }

  const { error } = await adminClient
    .from('products')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { error: error.message }

  return { ok: true }
}
