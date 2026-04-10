import { createClient } from '@supabase/supabase-js'

// WARNING: This client bypasses RLS. Never import in components or browser code.
// Use only in: webhook handlers, admin API routes, server-only operations.
export const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
