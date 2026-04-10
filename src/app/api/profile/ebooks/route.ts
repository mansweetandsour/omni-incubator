import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await adminClient
    .from('user_ebooks')
    .select('ebook_id, created_at, ebooks!inner(id, authors, products!inner(id, title, cover_image_url, slug))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[profile/ebooks] query error', error)
    return NextResponse.json({ error: 'Failed to fetch ebooks' }, { status: 500 })
  }

  // Deduplicate by ebook_id — first occurrence wins
  const seen = new Map<string, typeof data[0]>()
  for (const row of data ?? []) {
    if (!seen.has(row.ebook_id)) {
      seen.set(row.ebook_id, row)
    }
  }

  return NextResponse.json({ ebooks: Array.from(seen.values()) })
}
