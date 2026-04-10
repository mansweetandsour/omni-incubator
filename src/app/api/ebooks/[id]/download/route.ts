import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  // Check ownership
  const { data: ownership } = await adminClient
    .from('user_ebooks')
    .select('id')
    .eq('user_id', user.id)
    .eq('ebook_id', id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'You do not own this e-book' }, { status: 403 })
  }

  // Fetch ebook file path
  const { data: ebook, error: ebookError } = await adminClient
    .from('ebooks')
    .select('file_path')
    .eq('id', id)
    .single()

  if (ebookError || !ebook) {
    return NextResponse.json({ error: 'E-book not found' }, { status: 404 })
  }

  // Generate signed URL (1 hour expiry)
  const { data: signedData, error: signedError } = await adminClient.storage
    .from('ebooks')
    .createSignedUrl(ebook.file_path, 3600)

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'Could not generate download link' }, { status: 500 })
  }

  // Increment download count (fire-and-forget)
  void adminClient
    .rpc('increment_download_count', { p_user_id: user.id, p_ebook_id: id })
    .then(({ error }) => {
      if (error) console.error('[download] increment_download_count error', error)
    })

  return NextResponse.redirect(signedData.signedUrl, { status: 307 })
}
