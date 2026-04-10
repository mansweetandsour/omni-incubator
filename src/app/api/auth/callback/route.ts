import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Lazy-initialize admin client to avoid build-time env var errors
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next') ?? '/library'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // R8: Link sweepstake_entries for pre-signup lead confirms (fire-and-forget)
      const { data: { user: newUser } } = await supabase.auth.getUser()
      if (newUser?.id) {
        const adminClient = getAdminClient()
        void Promise.resolve(
          adminClient
            .from('sweepstake_entries')
            .update({ user_id: newUser.id })
            .is('user_id', null)
            .filter(
              'lead_capture_id',
              'in',
              `(SELECT id FROM lead_captures WHERE user_id = '${newUser.id}')`
            )
        ).catch((err: unknown) => console.error('[auth/callback] lead linking failed', err))
      }
      // Validate next param is safe (starts with /)
      const redirectTo = next.startsWith('/') ? next : '/library'
      return NextResponse.redirect(new URL(redirectTo, requestUrl.origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin))
}
