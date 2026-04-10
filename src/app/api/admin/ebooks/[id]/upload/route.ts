import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/admin'

const MAX_FILE_SIZE = 104_857_600 // 100MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth: verify user is authenticated
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Auth: verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id: productId } = await params

  // Parse multipart form data
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const type = formData.get('type')?.toString()

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!type || !['main', 'preview', 'cover'].includes(type)) {
    return NextResponse.json({ error: 'Invalid type. Must be main, preview, or cover' }, { status: 400 })
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Max 100MB.' }, { status: 413 })
  }

  // Validate MIME type
  const mimeType = file.type
  if (type === 'main' || type === 'preview') {
    if (mimeType !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Invalid file type. PDF required for main and preview files.' },
        { status: 415 }
      )
    }
  } else if (type === 'cover') {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedMimes.includes(mimeType)) {
      return NextResponse.json(
        { error: 'Invalid file type. JPEG, PNG, or WebP required for cover images.' },
        { status: 415 }
      )
    }
  }

  const fileBuffer = await file.arrayBuffer()
  const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')

  if (type === 'main') {
    const storagePath = `ebooks/${productId}/${filename}`
    const { error: uploadError } = await adminClient.storage
      .from('ebooks')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { error: dbError } = await adminClient
      .from('ebooks')
      .update({ file_path: storagePath })
      .eq('product_id', productId)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ path: storagePath })
  }

  if (type === 'preview') {
    const storagePath = `ebook-previews/${productId}/preview-${filename}`
    const { error: uploadError } = await adminClient.storage
      .from('ebook-previews')
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const { error: dbError } = await adminClient
      .from('ebooks')
      .update({ preview_file_path: storagePath })
      .eq('product_id', productId)

    if (dbError) {
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    return NextResponse.json({ path: storagePath })
  }

  // type === 'cover'
  const ext = filename.split('.').pop() ?? 'jpg'
  const baseName = filename.replace(/\.[^.]+$/, '') // strip extension to avoid doubling
  const storagePath = `covers/${productId}/cover-${baseName}.${ext}`
  const { error: uploadError } = await adminClient.storage
    .from('covers')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = adminClient.storage.from('covers').getPublicUrl(storagePath)

  const { error: dbError } = await adminClient
    .from('products')
    .update({ cover_image_url: publicUrl })
    .eq('id', productId)

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ path: storagePath, url: publicUrl })
}
