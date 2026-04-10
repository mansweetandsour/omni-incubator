import { NextRequest, NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params

  // Query ebooks for preview_file_path by product_id
  const { data: ebook } = await adminClient
    .from('ebooks')
    .select('preview_file_path')
    .eq('product_id', productId)
    .maybeSingle()

  if (!ebook) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!ebook.preview_file_path || ebook.preview_file_path === '') {
    return NextResponse.json({ error: 'No preview available' }, { status: 404 })
  }

  const {
    data: { publicUrl },
  } = adminClient.storage.from('ebook-previews').getPublicUrl(ebook.preview_file_path)

  return NextResponse.redirect(publicUrl, {
    status: 307,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline',
    },
  })
}
