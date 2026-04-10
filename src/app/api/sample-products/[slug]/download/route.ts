import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const token = request.nextUrl.searchParams.get('token')

  // Step 1: token absent
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 })
  }

  // Step 2: Look up lead_capture by token
  const { data: lead } = await adminClient
    .from('lead_captures')
    .select('id, confirmed_at, sample_product_id')
    .eq('confirmation_token', token)
    .maybeSingle()

  if (!lead) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 })
  }

  // Step 3: confirmed_at IS NULL
  if (!lead.confirmed_at) {
    return NextResponse.json({ error: 'Not confirmed' }, { status: 403 })
  }

  // Step 4: Look up sample_product by slug
  const { data: product } = await adminClient
    .from('sample_products')
    .select('id, file_path')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Step 5: Token mismatch check
  if (lead.sample_product_id !== product.id) {
    return NextResponse.json({ error: 'Token mismatch' }, { status: 403 })
  }

  // Step 6: Generate signed URL (1hr)
  const { data: signedUrl, error: signedUrlError } = await adminClient.storage
    .from('sample-products')
    .createSignedUrl(product.file_path, 3600)

  // Step 7: Error from signed URL generation
  if (signedUrlError || !signedUrl) {
    return NextResponse.json({ error: 'Failed to generate download link' }, { status: 500 })
  }

  // Step 8: Redirect 307
  return NextResponse.redirect(signedUrl.signedUrl, { status: 307 })
}
